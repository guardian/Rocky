import "core-js/es/object"
import cdk = require("@aws-cdk/core");
import lambda = require("@aws-cdk/aws-lambda");
import { Code } from "@aws-cdk/aws-lambda";
import { Duration, Tag } from "@aws-cdk/core";
import cdkS3 = require("@aws-cdk/aws-s3");
import { S3 } from 'aws-sdk'
import { mockS3 } from "@guardian/node-riffraff-artifact/lib/index";
import YAML from 'yaml'
import { generateManifest } from "@guardian/node-riffraff-artifact/lib/environment";
import { uploadAction, upload } from "@guardian/node-riffraff-artifact/lib/upload";
import { uploadManifest } from "@guardian/node-riffraff-artifact/lib/manifest";



interface Parameter {
  description: string;
}
interface ConstructorProps {
  name: string;
  url: string;
  parameters: {
    [name: string]: Parameter;
  };
  bucket: string;
  stacks: string[];
}

interface Deployment {
  name: string;
  path: string;
}

interface Lambda {
  name: string;
  handler: string;
  deployment: Deployment;
}

export class Rocky {
  name: string;
  stacks: string[];
  url: string;
  parameters: {
    [name: string]: Parameter;
  };
  deployments: Deployment[] = [];
  lambdas: Lambda[] = [];
  bucket: string;
  private hasRun: boolean = false

  constructor(props: ConstructorProps) {
    this.name = props.name;
    this.stacks = props.stacks;
    this.url = props.url;
    const defaultParams: {
      [name: string]: Parameter;
    } = { stage: { description: "Stage." } };
    this.parameters = { ...defaultParams, ...props.parameters };
    this.bucket = props.bucket;

    (global as any)._rocky = this;
  }

  public deployment(deployment: Deployment) {
    this.deployments = [...this.deployments, deployment];
    return deployment;
  }

  public lambda(lambda: Lambda) {
    this.lambdas = [...this.lambdas, lambda];
    return lambda;
  }

  public cdk() {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, this.name, { tags: { App: this.name } });
    this.cdkResources(stack);
  }

  private riffraffYaml() {
    const deployments = {
      ...Object.fromEntries(
        this.deployments.map(deployment => {
          return [
            deployment.name,
            {
              type: "aws-lambda",
              dependencies: ["cloudformation"],
              parameters: {
                prefixStack: false,
                bucket: this.bucket,
                fileName: `${deployment.name}.zip`,
                functionNames: this.lambdas
                  .filter(l => l.deployment.name === deployment.name)
                  .map(l => `${this.name}-${l.name}-`)
              }
            }
          ];
        })),
      cloudformation: {
        type: 'cloud-formation', app: this.name, parameters: {
          cloudFormationStackName: this.name,
          templatePath: 'cloudformation.yaml',
        }
      }
    }

    const contents = {
      stacks: this.stacks,
      regions: ["eu-west-1"],
      deployments
    };
    return YAML.stringify(contents)
  }

  //Cloudformations is sent as a string for very bad reasons
  async upload(cloudformation: string, dryRun: boolean) {
    const s3 = dryRun ? mockS3() : new S3()
    const actions = this.deployments.map(deployment => ({
      action: deployment.name,
      path: deployment.path,
      compress: "zip" as const
    }))
    const settings =
    {
      projectName: this.name,
      vcsURL: this.url,
      actions
    }
    const yaml = this.riffraffYaml()


    const manifest = generateManifest(this.name, this.url)

    await Promise.all(
      actions.map(action => {
        return uploadAction(s3, manifest, action);
      })
    );
    await upload(s3,
      "cloudformation/cloudformation.yaml",
      cloudformation,
      manifest,
    );
    await upload(s3,
      "riff-raff.yaml",
      yaml,
      manifest
    );
    await uploadManifest(s3, manifest);

  }

  private cdkResources(stack: cdk.Stack) {
    const params = Object.fromEntries(
      Object.entries(this.parameters).map(([name, { description }]) => [
        name,
        new cdk.CfnParameter(stack, name, { type: "String", description })
      ])
    );
    new cdk.Tag("Stage", params.stage.valueAsString)
    const selectedStack = this.stacks.length > 1 ? (new cdk.CfnParameter(stack, "selectedStack", { type: "string", description: "Which stack is this?", allowedValues: this.stacks })).valueAsString : this.stacks[0]
    new cdk.Tag("Stack", selectedStack)

    const lambdaEnv = Object.fromEntries(
      Object.entries(params).map(([name, param]) => [name, param.valueAsString])
    );
    const bucket = cdkS3.Bucket.fromBucketName(stack, this.bucket, this.bucket);
    this.lambdas.map(l => {
      const fn = new lambda.Function(stack, `${this.name}-${l.name}`, {
        functionName: `${this.name}-${l.name}-${params.stage.valueAsString}`,
        runtime: lambda.Runtime.NODEJS_10_X,
        memorySize: 512,
        timeout: Duration.seconds(60),
        code: Code.bucket(
          bucket,
          `${selectedStack}/${params.stage.valueAsString}/${l.deployment.name}/${l.deployment.name}.zip`
        ),
        handler: `${l.handler}`,
        environment: lambdaEnv
      });
      Tag.add(
        fn,
        "App",
        `${this.name}-${l.name}`
      );
      Tag.add(fn, "Stage", params.stage.valueAsString);
      Tag.add(fn, "Stack", selectedStack);
      return fn;
    });
    return stack;
  }
}
