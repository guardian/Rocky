import { Rocky } from './rocky'
const rocky = new Rocky({
  name: "Rocky",
  url: "https://github.com/guardian/Rocky",
  parameters: {
    "parameterName": {
      description: "This is where some data goes"
    }
  },
  bucket: "rocky-dist",
  stacks: ['frontend']
})

const deployment = rocky.deployment({
  name: "deployment",
  path: "./dist"
})

const lambda = rocky.lambda({
  name: "lambda",
  handler: "index.handler",
  deployment
})

rocky.cdk()

