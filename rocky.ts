import cdk = require("@aws-cdk/core");
import lambda = require("@aws-cdk/aws-lambda");
import { Code } from "@aws-cdk/aws-lambda";
import { Duration, Tag } from "@aws-cdk/core";
import s3 = require("@aws-cdk/aws-s3");
import { deployWithConf } from "@guardian/node-riffraff-artifact/lib/index";
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

  constructor(props: ConstructorProps) {
    this.name = props.name;
    this.stacks = props.stacks;
    this.url = props.url;
    const defaultParams: {
      [name: string]: Parameter;
    } = { stage: { description: "Stage." } };
    this.parameters = { ...defaultParams, ...props.parameters };
    this.bucket = props.bucket;
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
    const stack = new cdk.Stack(app, this.name, { tags: { Stack: this.name } });
    this.cdkResources(stack);
    return YAML.stringify(app.synth().getStackByName(this.name).template, { schema: 'yaml-1.1' })
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
          prependStackToCloudFormationStackName: false,
          cloudFormationStackName: this.name,
          templatePath: 'cloudformation.yaml',
          cloudFormationStackByTags: 'false'
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

  public async riffraff() {
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
    const cfn = this.cdk()

    const manifest = generateManifest(this.name, this.url)
    await Promise.all(
      actions.map(action => {
        return uploadAction(manifest, action);
      })
    );
    await upload(
      "cloudformation.yaml",
      cfn,
      manifest,
    );
    await upload(
      "riff-raff.yaml",
      yaml,
      manifest
    );
    await uploadManifest(manifest);

  }

  private cdkResources(scope: cdk.Construct) {
    const params = Object.fromEntries(
      Object.entries(this.parameters).map(([name, { description }]) => [
        name,
        new cdk.CfnParameter(scope, name, { type: "String", description })
      ])
    );
    const lambdaEnv = Object.fromEntries(
      Object.entries(params).map(([name, param]) => [name, param.valueAsString])
    );
    const bucket = s3.Bucket.fromBucketName(scope, this.bucket, this.bucket);
    this.lambdas.map(l => {
      const fn = new lambda.Function(scope, `${this.name}-${l.name}`, {
        functionName: `${this.name}-${l.name}-${params.stage.valueAsString}`,
        runtime: lambda.Runtime.NODEJS_10_X,
        memorySize: 512,
        timeout: Duration.seconds(60),
        code: Code.bucket(
          bucket,
          `${l.name}/${params.stage.valueAsString}/${l.deployment.name}/${l.deployment.name}.zip`
        ),
        handler: `${l.handler}`,
        environment: lambdaEnv
      });
      Tag.add(
        fn,
        "App",
        `${this.name}-${l.name}-${params.stage.valueAsString}`
      );
      Tag.add(fn, "Stage", params.stage.valueAsString);

      return fn;
    });
    return scope;
  }
}
