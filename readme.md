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
  name: "lambda",
  handler: "index.handler",
  deployment
})

```

## Using rocky

1. Create a rocky file, optionally in typescript.
2. Make sure `rocky run` is run against this file in CI.
3. Build your project.
4. Preview the build in riffraff, and run only the upload steps.
5. Download the cloudformation from the riffraff UI.
6. Create the cloudformation stack in the AWS web ui. App, Stack and Stage tags should be set. See the tags from the riffraff build preview in step 4.
7. Deploy the build in riffraff.
