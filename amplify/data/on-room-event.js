import { util, extensions } from '@aws-appsync/utils'

// Authentication alone is insufficient: subscriptions require room membership too.
export function request(ctx) {
  if (!ctx.identity || !ctx.identity.sub) util.unauthorized()
  return {
    operation: 'GetItem',
    key: util.dynamodb.toMapValues({ pk: `ROOM#${ctx.args.roomId}`, sk: `MEMBER#${ctx.identity.sub}` }),
    consistentRead: true,
  }
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type)
  if (!ctx.result) util.unauthorized()
  extensions.setSubscriptionFilter(util.transform.toSubscriptionFilter({ roomId: { eq: ctx.args.roomId } }))
  return null
}
