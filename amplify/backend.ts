import { defineBackend } from '@aws-amplify/backend'
import { RemovalPolicy } from 'aws-cdk-lib'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { roomService } from './functions/room-service/resource'

export const backend = defineBackend({ auth, data, roomService })
const table = new Table(backend.createStack('travel-storage'), 'TravelTable', {
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
  timeToLiveAttribute: 'ttl',
})
table.grantReadWriteData(backend.roomService.resources.lambda)
backend.roomService.addEnvironment('TRAVEL_TABLE_NAME', table.tableName)
backend.data.addDynamoDbDataSource('TravelTable', table)
