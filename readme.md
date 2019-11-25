# Rocky

Rocky writes all your cloudformation and riff-raff configuration for you.

```ts
const rocky = new Rocky({
  name: "Rocky",
  url: "https://github.com/guardian/Rocky"
  parameters: {
    "parameterName":{
      description: "This is where some data goes"
    }
  }
})


const deployment = rocky.deployment({
  name: "deployment",
  path: "./dist"
})

const lambda = rocky.lambda({
  handler: "index.handler",
  deployment
})

```
