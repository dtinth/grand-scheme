const Vue: typeof import('vue')
const VueRouter: typeof import('vue-router')
const d3: typeof import('d3-hierarchy')

type WorkItem = {
  id: string
  url: string
  title: string
  status: 'outstanding' | 'completed'
  links?: WorkItemLink[]
}

type WorkItemLink = {
  id: string
  type: 'subsequent' | 'dependency' | 'precedent' | 'dependent'
}
