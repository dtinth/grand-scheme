// @ts-check
/// <reference types="./typings" />

{
  /** Prefix your template with `html` to have Prettier auto-format it. */
  const html = String.raw

  const app = Vue.createApp({
    template: html`
      <div class="p-6">
        <h1 class="font-bold text-#8b8685">
          <router-link to="/">grand-scheme</router-link>
        </h1>
        <router-view></router-view>
      </div>
    `,
  })

  /** @type {import('vue-router').RouteRecordRaw[]} */
  const routes = []

  routes.push({
    path: '/',
    component: {
      template: html`<tree-graph></tree-graph>`,
    },
  })

  app.component('tree-graph', {
    setup() {
      const items = Vue.ref(/** @type {WorkItem[]} */ ([]))
      const tree = Vue.computed(() => createTree(items.value))
      Vue.onMounted(async () => {
        try {
          const url = new URLSearchParams(location.search).get('url')
          if (url) {
            await fetch(url)
              .then((r) => r.json())
              .then((r) => {
                console.log(r)
                items.value = r.tasks
              })
          }
          if (parent) {
            onmessage = (e) => {
              if (e.source === parent) {
                if (e.data.grandSchemeItems) {
                  items.value = e.data.grandSchemeItems
                }
              }
            }
            parent.postMessage({ grandSchemeReady: true }, '*')
          }
        } catch (error) {
          // TODO: #3 Display an error message visually instead of showing an alert
          alert(error)
        }
      })
      return { items, tree }
    },
    template: html`<div>
      <div class="relative" style="line-height: 17px; font-size: 15px">
        <tree-line
          :line="line"
          v-for="line of tree.lines"
          :key="line.id"
        ></tree-line>
        <tree-item
          :item="item"
          v-for="item of tree.items"
          :key="item.data.id"
        ></tree-item>
      </div>
    </div>`,
  })

  const nodeWidth = 256
  const nodeHeight = 64

  app.component('tree-item', {
    props: ['item'],
    setup(props) {
      const workItem = Vue.computed(() => props.item.data.item)
      return {
        boxClasses: Vue.computed(() => {
          return [
            workItem.value.status === 'completed'
              ? 'border-#8b8685'
              : 'border-#bbeeff',
          ]
        }),
        textClasses: Vue.computed(() => {
          return [
            workItem.value.status === 'completed'
              ? 'text-#8b8685'
              : 'text-#bbeeff',
          ]
        }),
        style: Vue.computed(() => {
          return {
            left: props.item.x * nodeWidth + 'px',
            top: props.item.y * nodeHeight + 'px',
            width: nodeWidth + 'px',
            height: nodeHeight + 'px',
          }
        }),
      }
    },
    template: html`<a
      :data-x="item.x"
      :data-y="item.y"
      :href="item.data.item.url || 'javascript://'"
      class="absolute flex items-center"
      :style="style"
    >
      <div
        class="flex-none rounded border w-4 h-4 bg-#353433"
        :class="boxClasses"
      ></div>
      <div class="px-2" :class="textClasses" style="max-width: 85%">
        <span
          class="bg-#353433"
          style="box-shadow: 4px 1px 0 #353433, 4px -1px 0 #353433, -4px 1px 0 #353433, -4px -1px 0 #353433;"
        >
          {{ item.data.item.title }}
        </span>
      </div>
    </a>`,
  })

  app.component('tree-line', {
    props: ['line'],
    setup(props) {
      return {
        style: Vue.computed(() => {
          const { from, to } = props.line
          const sx = from.x * nodeWidth + 24
          const sy = from.y * nodeHeight + 0.5 * nodeHeight
          const tx = to.x * nodeWidth + 8
          const ty = to.y * nodeHeight + 0.5 * nodeHeight
          const scale = Math.hypot(ty - sy, tx - sx) / nodeWidth
          const theta = Math.atan2(ty - sy, tx - sx)
          return {
            width: nodeWidth + 'px',
            transformOrigin: 'left',
            transform: `translate(0, -50%) translate(${sx}px, ${sy}px) rotate(${theta}rad) scaleX(${scale})`,
          }
        }),
      }
    },
    template: html`<div class="h-px bg-#8b8685 absolute" :style="style"></div>`,
  })

  /**
   * @param {WorkItem[]} items
   * @param {string[]} rootIds
   */
  function createTree(items, rootIds = items.map((item) => item.id)) {
    const proposals = new ProposalList(items)
    const treeGraph = new TreeGraph(proposals, new ItemMap(items), rootIds)
    console.log(treeGraph)
    const d3Tree = treeGraph.toTree()
    /** @typedef {import('d3-hierarchy').HierarchyPointNode} TreeItem */
    const treeItems = /** @type {TreeItem[]} */ ([])
    d3Tree.eachBefore((item) => {
      if (item.data.type !== 'root') {
        treeItems.push(item)
        item.data.id
      }
    })
    let minX = Math.min(...treeItems.map((t) => t.x))
    let minY = Math.min(...treeItems.map((t) => t.y))
    const idToItemMap = /** @type {Map<string, TreeItem>} */ (new Map())
    treeItems.forEach((item) => {
      ;[item.x, item.y] = [item.y - minY, item.x - minX]
      idToItemMap.set(item.data.id, item)
    })
    const treeLines = /** @type {{ from: TreeItem, to: TreeItem }[]} */ ([])
    proposals.toArray().forEach(({ parentId, childId }) => {
      const from = idToItemMap.get(parentId)
      const to = idToItemMap.get(childId)
      if (!from || !to) return
      treeLines.push({ from, to })
    })
    return {
      items: treeItems,
      lines: treeLines,
    }
  }

  class ItemMap {
    /**
     * @param {WorkItem[]} items
     */
    constructor(items) {
      this._map = new Map(items.map((item) => [item.id, item]))
    }
    /**
     * @param {string} id
     */
    get(id) {
      return this._map.get(id)
    }
  }

  class ProposalList {
    /**
     * @param {WorkItem[]} items
     */
    constructor(items) {
      const proposals = []
      for (const item of items) {
        for (const link of item.links || []) {
          proposals.push(
            link.type === 'dependency' || link.type === 'subsequent'
              ? [item.id, link.id]
              : [link.id, item.id],
          )
        }
      }
      this._proposalList = proposals.sort((a, z) => {
        return a[0] < z[0]
          ? -1
          : a[0] > z[0]
          ? 1
          : a[1] < z[1]
          ? -1
          : a[1] > z[1]
          ? 1
          : 0
      })
    }
    /**
     * @param {string} id
     */
    childrenOf(id) {
      return this._proposalList
        .filter((p) => p[0] === id)
        .map(([parentId, childId]) => ({ parentId, childId }))
    }
    /**
     * @param {string} id
     */
    parentsOf(id) {
      return this._proposalList
        .filter((p) => p[1] === id)
        .map(([parentId, childId]) => ({ parentId, childId }))
    }
    toArray() {
      return this._proposalList.map(([parentId, childId]) => ({
        parentId,
        childId,
      }))
    }
  }

  class TreeGraph {
    /**
     * @param {ProposalList} proposals
     * @param {ItemMap} itemMap
     * @param {string[]} rootIds
     */
    constructor(proposals, itemMap, rootIds) {
      const visited = /** @type {Set<string>} */ (new Set())
      const nodeMap = /** @type {Map<string, TreeGraphNode>} */ (new Map())
      const root = new TreeGraphNode('root')
      for (const rootId of rootIds) {
        const visitQueue = /** @type {Set<string>} */ (new Set())
        visitQueue.add(rootId)

        // VisitRootNode
        let visitRootNode = nodeMap.get(rootId)
        if (!visitRootNode) {
          visitRootNode = new TreeGraphNode('item', rootId)
          nodeMap.set(rootId, visitRootNode)
          root.beget(visitRootNode)
        }

        // Perform a BFS to generate a compact tree of work items
        for (const parentId of visitQueue) {
          if (visited.has(parentId)) continue
          const parentNode = nodeMap.get(parentId)
          visited.add(parentId)
          for (const { childId } of proposals.childrenOf(parentId)) {
            visitQueue.add(childId)
            let childNode = nodeMap.get(childId)
            if (!childNode) {
              childNode = new TreeGraphNode('item', childId)
              nodeMap.set(childId, childNode)
              parentNode.beget(childNode)
            }
          }
        }
      }

      // Reparent
      const getReparentingCandidate = () => {
        const depthMap = new DepthMap()
        for (const node of nodeMap.values()) {
          if (node.type === 'root') continue
          const parentIds = proposals.parentsOf(node.id)
          for (const { parentId } of parentIds) {
            const candidateParentNode = nodeMap.get(parentId)
            if (!candidateParentNode) continue
            if (candidateParentNode.contains(node)) continue
            if (depthMap.depth(candidateParentNode) < depthMap.depth(node))
              continue
            return { newParent: candidateParentNode, node }
          }
        }
        return null
      }
      for (;;) {
        const candidate = getReparentingCandidate()
        if (!candidate) break
        candidate.newParent.beget(candidate.node)
      }

      this._itemMap = itemMap
      this._root = root
    }
    toTree() {
      /**
       * @param {TreeGraphNode} node
       */
      const toD3 = (node) => {
        return {
          id: node.id,
          type: node.type,
          item: this._itemMap.get(node.id),
          children: node.childNodes.map((childNode) => toD3(childNode)),
        }
      }
      const layoutTree = d3
        .tree()
        .nodeSize([1, 1])
        .separation(() => 1)
      return layoutTree(d3.hierarchy(toD3(this._root)))
    }
  }

  class DepthMap {
    constructor() {
      // this._map = /** @type {Map<TreeGraphNode, number>} */ (new Map())
    }
    /**
     * @param {TreeGraphNode} node
     */
    depth(node) {
      if (!node.parentNode) return 0
      return this.depth(node.parentNode) + 1
      // TODO: Optimize depth map
      // let depth = this._map.get(node)
      // if (depth == null) {
      // }
    }
  }

  class TreeGraphNode {
    /**
     * @param {'root' | 'item'} type
     * @param {string} [id]
     */
    constructor(type, id) {
      this.type = type
      this.id = id
      this.parentNode = /** @type {TreeGraphNode | null} */ (null)
      this.childNodes = /** @type {TreeGraphNode[]} */ ([])
    }
    /**
     * @param {TreeGraphNode} childNode
     */
    beget(childNode) {
      if (childNode.parentNode) {
        const childIndex = childNode.parentNode.childNodes.indexOf(childNode)
        childNode.parentNode.childNodes.splice(childIndex, 1)
      }
      this.childNodes.push(childNode)
      childNode.parentNode = this
    }
    /**
     * @param {TreeGraphNode} childNode
     */
    contains(childNode) {
      for (let node = childNode; node; node = node.parentNode) {
        if (node === this) return true
      }
      return false
    }
  }

  const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes: routes,
  })

  app.use(router)

  Object.assign(window, { vm: app.mount('#app') })
}
