interface Parameter {
  description: string
}
interface ConstructorProps {
  name: string
  url: string
  parameters: {
    [name: string]: Parameter
  }
}

interface Deployment {
  name: string
  path: string
}

interface Lambda {
  handler: string
  deployment: Deployment
}

export class Rocky {
  name: string
  url: string
  parameters: {
    [name: string]: Parameter
  }
  deployments: Deployment[]
  lambdas: Lambda[]

  constructor(props: ConstructorProps) {
    this.name = props.name
    this.url = props.url
    this.parameters = props.parameters
  }

  public deployment(deployment: Deployment) {
    this.deployments = [... this.deployments, deployment]
  }

  public lambda(lambda: Lambda) {
    this.lambdas = [...this.lambdas, lambda]
  }

}