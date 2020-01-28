#!/usr/bin/env node
// npx cdk synth --app='npx ts-node test.ts' Rocky
import yargs from 'yargs'
import { resolve } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { Rocky } from './rocky'
import { register } from 'ts-node'
import { accessSync, constants as fsConstants } from 'fs'
import { image } from './image'
import { idText } from 'typescript'

const synth = async (filePath: string): Promise<string> => {
  const appCommand = `node ${filePath.slice(-3) === (".ts") ? "-r ts-node/register" : ""} -e \\"require('${filePath}'), global._rocky.cdk()\\"`
  //very danger
  //https://github.com/aws/aws-cdk/issues/601 i know.

  const { stdout, stderr } = await promisify(exec)(`./node_modules/.bin/cdk synth --app="${appCommand}"`)//{ stdio: 'inherit' }
  if (stderr) {
    console.error(stderr)
    process.exit(1)
  }
  return stdout
}


yargs.command("run [file] [dryRun]", "synthesise cloudformation and upload to riffraff", y => {
  y.positional("file", { describe: "path to rocky file", type: 'string' })
  y.positional("dryRun", { describe: "do not upload to s3", type: 'boolean', default: false })
}, async (args) => {
  console.log(args)
  const file = args.file
  const dryRun = !!args.dryRun

  if (typeof file !== 'string') process.exit(1)

  const filePath = resolve(file)

  accessSync(filePath, fsConstants.R_OK) //this throws if it can't read the file. the async api is not better

  const cfn = await synth(filePath)
  register()
  require(filePath)
  const rocky: Rocky = (global as any)._rocky
  rocky.upload(cfn, dryRun)
  if (dryRun) console.log(`\u001B]1337;File=inline=1:${image}\u0007`)

}).argv


yargs.command("synth [file]", "synthesise cloudformation", y => {
  y.positional("file", { describe: "path to rocky file", type: 'string' })
}, async (args) => {
  const file = args.file
  const dryRun = !!args.dryRun

  if (typeof file !== 'string') process.exit(1)

  const filePath = resolve(file)

  accessSync(filePath, fsConstants.R_OK) //this throws if it can't read the file. the async api is not better

  const cfn = await synth(filePath)
  console.log(cfn)

}).argv
