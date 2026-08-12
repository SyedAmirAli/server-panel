
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.ApiKeyScalarFieldEnum = {
  id: 'id',
  name: 'name',
  keyHash: 'keyHash',
  keyPrefix: 'keyPrefix',
  keySecret: 'keySecret',
  isActive: 'isActive',
  allowedFrom: 'allowedFrom',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  lastUsedAt: 'lastUsedAt'
};

exports.Prisma.MailboxScalarFieldEnum = {
  id: 'id',
  address: 'address',
  displayName: 'displayName',
  imapHost: 'imapHost',
  imapPort: 'imapPort',
  imapSecure: 'imapSecure',
  imapUser: 'imapUser',
  imapPassword: 'imapPassword',
  smtpHost: 'smtpHost',
  smtpPort: 'smtpPort',
  smtpSecure: 'smtpSecure',
  smtpUser: 'smtpUser',
  smtpPassword: 'smtpPassword',
  isActive: 'isActive',
  lastSyncUid: 'lastSyncUid',
  lastSyncAt: 'lastSyncAt',
  lastSyncError: 'lastSyncError',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MailMessageScalarFieldEnum = {
  id: 'id',
  uid: 'uid',
  mailboxId: 'mailboxId',
  messageId: 'messageId',
  from: 'from',
  to: 'to',
  cc: 'cc',
  bcc: 'bcc',
  subject: 'subject',
  snippet: 'snippet',
  body: 'body',
  html: 'html',
  flags: 'flags',
  attachments: 'attachments',
  receivedAt: 'receivedAt',
  isRead: 'isRead',
  syncedAt: 'syncedAt'
};

exports.Prisma.SentMessageScalarFieldEnum = {
  id: 'id',
  apiKeyId: 'apiKeyId',
  from: 'from',
  to: 'to',
  cc: 'cc',
  bcc: 'bcc',
  subject: 'subject',
  status: 'status',
  error: 'error',
  createdAt: 'createdAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  action: 'action',
  actorType: 'actorType',
  actorId: 'actorId',
  entityType: 'entityType',
  entityId: 'entityId',
  metadata: 'metadata',
  ip: 'ip',
  userAgent: 'userAgent',
  createdAt: 'createdAt',
  message: 'message'
};

exports.Prisma.EmailConfigScalarFieldEnum = {
  id: 'id',
  name: 'name',
  host: 'host',
  port: 'port',
  username: 'username',
  password: 'password',
  tls: 'tls',
  requireTLS: 'requireTLS',
  secure: 'secure',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BucketScalarFieldEnum = {
  id: 'id',
  publicId: 'publicId',
  name: 'name',
  provider: 'provider',
  endpoint: 'endpoint',
  region: 'region',
  bucketName: 'bucketName',
  forcePathStyle: 'forcePathStyle',
  accessKeyEnc: 'accessKeyEnc',
  secretKeyEnc: 'secretKeyEnc',
  publicBaseUrl: 'publicBaseUrl',
  isActive: 'isActive',
  lockedPrefixes: 'lockedPrefixes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StorageApiKeyScalarFieldEnum = {
  id: 'id',
  name: 'name',
  keyHash: 'keyHash',
  keyPrefix: 'keyPrefix',
  keySecret: 'keySecret',
  isActive: 'isActive',
  allowedBuckets: 'allowedBuckets',
  defaultBucketId: 'defaultBucketId',
  allowedOrigins: 'allowedOrigins',
  allowedIps: 'allowedIps',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  lastUsedAt: 'lastUsedAt'
};

exports.Prisma.StorageObjectScalarFieldEnum = {
  id: 'id',
  bucketId: 'bucketId',
  key: 'key',
  prefix: 'prefix',
  originalName: 'originalName',
  size: 'size',
  contentType: 'contentType',
  etag: 'etag',
  isPrivate: 'isPrivate',
  convertedWebp: 'convertedWebp',
  compressed: 'compressed',
  quality: 'quality',
  uploadedByType: 'uploadedByType',
  uploadedById: 'uploadedById',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CandidateProfileScalarFieldEnum = {
  id: 'id',
  name: 'name',
  headline: 'headline',
  email: 'email',
  phone: 'phone',
  location: 'location',
  timezone: 'timezone',
  availability: 'availability',
  summary: 'summary',
  titles: 'titles',
  skills: 'skills',
  experience: 'experience',
  education: 'education',
  projects: 'projects',
  certifications: 'certifications',
  languages: 'languages',
  links: 'links',
  sourceType: 'sourceType',
  sourcePath: 'sourcePath',
  sourceHash: 'sourceHash',
  rawSource: 'rawSource',
  isDefault: 'isDefault',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JobSourceScalarFieldEnum = {
  id: 'id',
  key: 'key',
  name: 'name',
  adapter: 'adapter',
  isActive: 'isActive',
  config: 'config',
  requiresCredentials: 'requiresCredentials',
  credentialsReady: 'credentialsReady',
  lastRunAt: 'lastRunAt',
  lastRunStatus: 'lastRunStatus',
  lastRunError: 'lastRunError',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JobPostingScalarFieldEnum = {
  id: 'id',
  sourceId: 'sourceId',
  externalId: 'externalId',
  dedupeHash: 'dedupeHash',
  title: 'title',
  company: 'company',
  companyUrl: 'companyUrl',
  location: 'location',
  isRemote: 'isRemote',
  employmentType: 'employmentType',
  salaryRaw: 'salaryRaw',
  salaryMin: 'salaryMin',
  salaryMax: 'salaryMax',
  currency: 'currency',
  url: 'url',
  applyUrl: 'applyUrl',
  applyEmail: 'applyEmail',
  description: 'description',
  tags: 'tags',
  requirements: 'requirements',
  postedAt: 'postedAt',
  discoveredAt: 'discoveredAt',
  expiresAt: 'expiresAt',
  status: 'status',
  raw: 'raw',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JobMatchScalarFieldEnum = {
  id: 'id',
  postingId: 'postingId',
  profileId: 'profileId',
  stars: 'stars',
  score: 'score',
  verdict: 'verdict',
  summary: 'summary',
  strengths: 'strengths',
  gaps: 'gaps',
  matchedSkills: 'matchedSkills',
  missingSkills: 'missingSkills',
  model: 'model',
  scoredAt: 'scoredAt'
};

exports.Prisma.JobApplicationScalarFieldEnum = {
  id: 'id',
  postingId: 'postingId',
  profileId: 'profileId',
  status: 'status',
  channel: 'channel',
  toEmail: 'toEmail',
  subject: 'subject',
  body: 'body',
  gapsNote: 'gapsNote',
  model: 'model',
  sentMessageId: 'sentMessageId',
  sentAt: 'sentAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JobRunScalarFieldEnum = {
  id: 'id',
  trigger: 'trigger',
  status: 'status',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  sourcesRun: 'sourcesRun',
  stats: 'stats',
  error: 'error'
};

exports.Prisma.JobRunLogScalarFieldEnum = {
  id: 'id',
  runId: 'runId',
  seq: 'seq',
  level: 'level',
  source: 'source',
  message: 'message',
  data: 'data',
  createdAt: 'createdAt'
};

exports.Prisma.JobFinderSettingScalarFieldEnum = {
  id: 'id',
  cronEnabled: 'cronEnabled',
  cronExpression: 'cronExpression',
  lookbackHours: 'lookbackHours',
  minStars: 'minStars',
  maxJobsPerRun: 'maxJobsPerRun',
  scoringModel: 'scoringModel',
  writingModel: 'writingModel',
  extractionModel: 'extractionModel',
  keywords: 'keywords',
  locations: 'locations',
  excludeCompanies: 'excludeCompanies',
  activeProfileId: 'activeProfileId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProfileProjectScalarFieldEnum = {
  id: 'id',
  profileId: 'profileId',
  name: 'name',
  description: 'description',
  role: 'role',
  period: 'period',
  stack: 'stack',
  metrics: 'metrics',
  note: 'note',
  url: 'url',
  sortOrder: 'sortOrder',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProfileExperienceScalarFieldEnum = {
  id: 'id',
  profileId: 'profileId',
  company: 'company',
  position: 'position',
  period: 'period',
  location: 'location',
  employmentType: 'employmentType',
  points: 'points',
  stack: 'stack',
  sortOrder: 'sortOrder',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProfileSkillScalarFieldEnum = {
  id: 'id',
  profileId: 'profileId',
  name: 'name',
  category: 'category',
  level: 'level',
  highlighted: 'highlighted',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt'
};

exports.Prisma.ProfileLinkScalarFieldEnum = {
  id: 'id',
  profileId: 'profileId',
  label: 'label',
  url: 'url',
  kind: 'kind',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt'
};

exports.Prisma.ProfileInfoItemScalarFieldEnum = {
  id: 'id',
  profileId: 'profileId',
  kind: 'kind',
  title: 'title',
  rawText: 'rawText',
  bucketId: 'bucketId',
  folder: 'folder',
  fileName: 'fileName',
  storageKey: 'storageKey',
  mimeType: 'mimeType',
  sizeBytes: 'sizeBytes',
  extractionStatus: 'extractionStatus',
  extractionError: 'extractionError',
  model: 'model',
  extractedAt: 'extractedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProfileFactProposalScalarFieldEnum = {
  id: 'id',
  profileId: 'profileId',
  infoItemId: 'infoItemId',
  targetType: 'targetType',
  payload: 'payload',
  confidence: 'confidence',
  status: 'status',
  reviewedAt: 'reviewedAt',
  createdRowId: 'createdRowId',
  model: 'model',
  createdAt: 'createdAt'
};

exports.Prisma.ResumeDocumentScalarFieldEnum = {
  id: 'id',
  profileId: 'profileId',
  postingId: 'postingId',
  applicationId: 'applicationId',
  kind: 'kind',
  format: 'format',
  title: 'title',
  contentJson: 'contentJson',
  blocks: 'blocks',
  bucketId: 'bucketId',
  folder: 'folder',
  fileName: 'fileName',
  storageKey: 'storageKey',
  sizeBytes: 'sizeBytes',
  pageCount: 'pageCount',
  warnings: 'warnings',
  model: 'model',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  ApiKey: 'ApiKey',
  Mailbox: 'Mailbox',
  MailMessage: 'MailMessage',
  SentMessage: 'SentMessage',
  AuditLog: 'AuditLog',
  EmailConfig: 'EmailConfig',
  Bucket: 'Bucket',
  StorageApiKey: 'StorageApiKey',
  StorageObject: 'StorageObject',
  CandidateProfile: 'CandidateProfile',
  JobSource: 'JobSource',
  JobPosting: 'JobPosting',
  JobMatch: 'JobMatch',
  JobApplication: 'JobApplication',
  JobRun: 'JobRun',
  JobRunLog: 'JobRunLog',
  JobFinderSetting: 'JobFinderSetting',
  ProfileProject: 'ProfileProject',
  ProfileExperience: 'ProfileExperience',
  ProfileSkill: 'ProfileSkill',
  ProfileLink: 'ProfileLink',
  ProfileInfoItem: 'ProfileInfoItem',
  ProfileFactProposal: 'ProfileFactProposal',
  ResumeDocument: 'ResumeDocument'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
