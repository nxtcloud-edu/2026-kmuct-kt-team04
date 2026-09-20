import { mkdirSync } from 'node:fs'
import type { App } from 'aws-cdk-lib'

// Local CloudFormation validation only: a placeholder account, no deploy command.
process.env.CDK_CONTEXT_JSON = JSON.stringify({
  'amplify-backend-name': 'check',
  'amplify-backend-namespace': 'team04',
  'amplify-backend-type': 'sandbox',
})
process.env.CDK_DEFAULT_ACCOUNT = '000000000000'
process.env.CDK_DEFAULT_REGION = 'us-east-1'
process.env.CDK_OUTDIR = '.amplify/synth-check'
mkdirSync(process.env.CDK_OUTDIR, { recursive: true })
const { backend } = await import('../amplify/backend')
const assembly = (backend.stack.node.root as App).synth()
console.log(`Local synthesis passed: ${assembly.stacks.length} root stack(s). No AWS resources deployed.`)
