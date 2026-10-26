const { createRequire } = require('node:module');
const apiRequire = createRequire(require('node:path').resolve(__dirname, '../../../apps/api/package.json'));
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {DataSource}=apiRequire('typeorm');
const {ConfigService}=apiRequire('@nestjs/config');
const path=require('node:path');
const {LegalPublication}=require('../../../apps/api/src/modules/legal/entities/legal-publication.entity');
const {LegalPublicationAsset}=require('../../../apps/api/src/modules/legal/entities/legal-publication-asset.entity');
const {SystemsService}=require('../../../apps/api/src/modules/legal/systems/systems.service');
const {IntegrationRegistryService}=require('../../../apps/api/src/modules/legal/integrations/registry/integration-registry.service');
const {ExternalAcceptanceService}=require('../../../apps/api/src/modules/legal/integrations/acceptance/external-acceptance.service');
const {LegalAcceptanceValidationService}=require('../../../apps/api/src/modules/legal/authorization/legal-acceptance-validation.service');
if(!process.env.TEST_DATABASE_PORT) throw new Error('TEST_DATABASE_PORT must point to an isolated disposable PostgreSQL instance');
const db=new DataSource({type:'postgres',host:'127.0.0.1',port:Number(process.env.TEST_DATABASE_PORT),username:'postgres',password:'isolated-test-only',database:'legal_external_test',synchronize:false,entities:[path.join(__dirname,'../../../apps/api/src/**/*.entity.ts')],migrations:[path.join(__dirname,'../../../apps/api/src/database/migrations/*.ts')]});
async function main(){
 await db.initialize();
 try {
 const allMigrations=db.migrations;
 db.migrations=allMigrations.filter(m=>!['SystemCatalog1792627200000','SystemServices1792627201000','VerificationServiceApproval1792627202000','CapabilityFunctions1792713600000','SystemConnectionFunctions1792800000000','CapabilityFieldFunctions1792886400000','LegalCollectorIntrospection1792972800000','SubscriptionManagementCapability1793062800000'].includes(m.constructor.name));
 await db.runMigrations();
 db.migrations=allMigrations;
 const issuer=randomUUID(),app=randomUUID(),organization=randomUUID(),subject=randomUUID(),sessionId=randomUUID();
 await db.query(`INSERT INTO issuers(id,key,name,legal_name,type,country_code,default_locale) VALUES($1,'test','Test','Test','company','MX','es-MX')`,[issuer]);
 await db.query(`INSERT INTO applications(id,issuer_id,key,name) VALUES($1,$2,'test','Test')`,[app,issuer]);
 const docs=[],versions=[],rules=[];
 for(let n=0;n<3;n++){
 const d=randomUUID(),v=randomUUID(),rule=randomUUID();docs.push(d);versions.push(v);rules.push(rule);
 await db.query(`INSERT INTO documents(id,issuer_id,application_id,key,locale,title,document_type) VALUES($1,$2,$3,$4,'es-MX','External test',$5)`,[d,issuer,app,'doc'+n,['terms_and_conditions','privacy_notice','custom_policy'][n]]);
 await db.query(`INSERT INTO document_versions(id,document_id,version,status,content_hash) VALUES($1,$2,'1.0.0','published',$3)`,[v,d,'a'.repeat(64)]);
 await db.query(`INSERT INTO acceptance_rules(id,document_id,version_id,issuer_id,application_id,acceptance_mode) VALUES($1,$2,$3,$4,$5,'individual')`,[rule,d,v,issuer,app]);
 }
 for(let n=0;n<docs.length;n++){
 const publication=await db.getRepository(LegalPublication).save({documentId:docs[n],documentVersionId:versions[n],issuerId:issuer,applicationId:app,documentType:['terms_and_conditions','privacy_notice','custom_policy'][n],productId:'test',documentKey:'doc'+n,version:'1.0.0',status:'published',effectiveFrom:new Date(),rulesSnapshot:[],contentHash:'a'.repeat(64),requestedByIdentityIssuer:'http://localhost:4000',requestedBySubjectId:subject});
 await db.getRepository(LegalPublicationAsset).save({publicationId:publication.id,kind:'html',s3Bucket:'isolated-test',s3ObjectKey:'doc'+n+'.html',contentType:'text/html',sizeBytes:20,sha256:'a'.repeat(64)});
 }
 const config=new ConfigService({sso:{issuer:'http://localhost:4000'},legalIntegrations:{production:false}});
 const systemId=randomUUID();
 const originalClientId=randomUUID();
 const legacySettings={identityIssuer:'urn:hemia:balanz',productCode:'balanz_cfdi',contextUrl:'http://localhost:3021/api/v1/internal/legal/consumer-context'};
 await db.query('INSERT INTO external_identity_sources(id,code,name,identity_issuer,issuer_id,application_id,product_code,context_url,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)',[systemId,'balanz','Balanz',legacySettings.identityIssuer,issuer,app,legacySettings.productCode,legacySettings.contextUrl]);
 await db.query("INSERT INTO external_identity_source_clients(id,source_id,oauth_issuer,client_id,role,enabled) VALUES($1,$2,'http://localhost:4000','balanz-billing-service','collector',true)",[originalClientId,systemId]);
 for(const [position,documentId] of docs.entries())await db.query('INSERT INTO external_identity_source_documents(source_id,document_id,position) VALUES($1,$2,$3)',[systemId,documentId,position]);
 db.migrations=allMigrations.filter(m=>m.constructor.name!=='LegalCollectorIntrospection1792972800000');
 await db.runMigrations();
 const beforeFunctions=(await db.query("SELECT functions FROM system_capabilities WHERE code='legalAcceptances'"))[0].functions;
 db.migrations=allMigrations;
 await db.runMigrations();
 const expectedFunctions=beforeFunctions.map(fn=>fn.code==='collector'?{...fn,scopes:[...fn.scopes,{audience:'identity-api',code:'identity.tokens.introspect'}]}:fn);
 assert.deepEqual((await db.query("SELECT functions FROM system_capabilities WHERE code='legalAcceptances'"))[0].functions,expectedFunctions);
 await allMigrations.find(m=>m.constructor.name==='LegalCollectorIntrospection1792972800000').up({query:(...args)=>db.query(...args)});
 assert.deepEqual((await db.query("SELECT functions FROM system_capabilities WHERE code='legalAcceptances'"))[0].functions,expectedFunctions);
 assert.deepEqual((await db.query("SELECT schema->'fields'->0->'functions' AS roles FROM system_capabilities WHERE code='legalAcceptances'"))[0].roles,['collector']);
 assert.deepEqual((await db.query("SELECT field->'functions' AS roles FROM system_capabilities,jsonb_array_elements(schema->'fields') field WHERE code='payments' AND field->>'key'='receiverService'"))[0].roles,['receiver']);
 const settings={identityIssuer:legacySettings.identityIssuer,productCode:legacySettings.productCode,contextService:'legal-context'};
 const services=[{code:'legal-context',name:'Verificación de aceptaciones',url:legacySettings.contextUrl,enabled:true,audience:'balanz-api',resource:'http://localhost:3021'}];
 assert.deepEqual((await db.query('SELECT services FROM systems WHERE id=$1',[systemId]))[0].services,[{...services[0],audience:''}]);
 assert.equal((await db.query("SELECT schema->'fields'->2->>'format' AS format FROM system_capabilities WHERE code='legalAcceptances'"))[0].format,'service');
 const actor={identityIssuer:'http://localhost:4000',subjectId:randomUUID(),actorType:'user',traceId:randomUUID(),authorization:{assignments:[{role_code:'legal.integration_manager',resource_scope:{type:'applications',ids:[app]},consumer_scope:{type:'not_applicable',organization_ids:[]},valid_from:1,expires_at:null}],expiresAt:Math.floor(Date.now()/1000)+300}};
 const clients=[{oauthIssuer:'http://localhost:4000',clientId:'balanz-billing-service',capabilityCode:'legalAcceptances',roles:['collector'],enabled:true},{oauthIssuer:'http://localhost:4000',clientId:'billing-legal-service',capabilityCode:'legalAcceptances',roles:['validator'],enabled:true}];
 const scopeCatalog=['legal.integration.acceptances.prepare','legal.integration.acceptances.create','legal.integration.acceptances.validate'].map(code=>({code,name:code,audience:'legal-api',resource:'http://localhost:3017',enabled:true}));
 scopeCatalog.push({code:'identity.tokens.introspect',name:'Introspección',audience:'identity-api',resource:'http://localhost:4000',enabled:true});
 scopeCatalog.push({code:'notifications.messages.send',name:'Enviar mensajes',audience:'notifications-api',resource:'https://notifications.example',enabled:true});
 const genericClient={oauthIssuer:'http://localhost:4000',clientId:'notification-service',capabilityCode:'notifications',roles:['sender'],enabled:true};
 const systems=new SystemsService(db,config,{scopeCatalog:async()=>scopeCatalog,directory:async()=>[...clients.map(c=>({...c,name:c.clientId,scopes:[],serviceDestinations:[{resource:'http://localhost:3017',audience:'legal-api',scopes:c.roles.includes('collector')?['legal.integration.acceptances.prepare','legal.integration.acceptances.create']:['legal.integration.acceptances.validate']},...(c.roles.includes('collector')?[{resource:'http://localhost:4000',audience:'identity-api',scopes:['identity.tokens.introspect']}]:[])]})),{...genericClient,scopes:[],serviceDestinations:[{resource:'https://notifications.example',audience:'notifications-api',scopes:['notifications.messages.send']}]}]});
 assert.deepEqual((await systems.get(systemId)).configuration.legalAcceptances,settings);
 await systems.save({code:'balanz',name:'Balanz',enabled:true,configuration:{legalAcceptances:settings},services,clients},actor,systemId);
 assert.equal((await db.query('SELECT id FROM external_identity_source_clients WHERE source_id=$1 AND client_id=$2',[systemId,'balanz-billing-service']))[0].id,originalClientId);
 const registry=new IntegrationRegistryService(db,config,systems);
 const source=await registry.save({actor},{systemId,applicationId:app,documentIds:docs},systemId);
 const catalogRequest={actor:{...actor,permissions:['legal.systems.read','legal.systems.write']}};
 const catalogSaved=await registry.saveFromCatalog(catalogRequest,{systemId,applicationId:app,documentIds:docs});
 const catalogRetried=await registry.saveFromCatalog(catalogRequest,{systemId,applicationId:app,documentIds:docs});
 assert.equal(catalogSaved.id,source.id); assert.equal(catalogRetried.id,source.id);
 assert.equal((await db.query('SELECT count(*)::int n FROM external_identity_sources WHERE system_id=$1',[systemId]))[0].n,1);
 assert.equal((await registry.catalogOptions(catalogRequest)).documents.length,3);
 const originalLinks=await db.query('SELECT document_id FROM external_identity_source_documents WHERE source_id=$1 ORDER BY position',[source.id]);
 for(const [change,restore] of [
  ["UPDATE document_versions SET status='draft' WHERE id=$1","UPDATE document_versions SET status='published' WHERE id=$1"],
  ["UPDATE document_versions SET effective_from=now()+interval '1 day' WHERE id=$1","UPDATE document_versions SET effective_from=NULL WHERE id=$1"],
  ["UPDATE acceptance_rules SET status='inactive' WHERE version_id=$1","UPDATE acceptance_rules SET status='active' WHERE version_id=$1"],
  ["UPDATE publications SET status='failed' WHERE document_version_id=$1","UPDATE publications SET status='published' WHERE document_version_id=$1"],
  ["UPDATE publication_assets SET kind='source' WHERE publication_id IN (SELECT id FROM publications WHERE document_version_id=$1)","UPDATE publication_assets SET kind='html' WHERE publication_id IN (SELECT id FROM publications WHERE document_version_id=$1)"],
  ["UPDATE documents SET document_type='nda' WHERE id IN (SELECT document_id FROM document_versions WHERE id=$1)","UPDATE documents SET document_type='terms_and_conditions' WHERE id IN (SELECT document_id FROM document_versions WHERE id=$1)"],
 ]){
  await db.query(change,[versions[0]]);
  assert.equal((await registry.catalogOptions(catalogRequest)).documents.some(d=>d.id===docs[0]),false);
  await assert.rejects(registry.saveFromCatalog(catalogRequest,{systemId,applicationId:app,documentIds:[docs[0]]}),e=>e.status===400);
  assert.deepEqual(await db.query('SELECT document_id FROM external_identity_source_documents WHERE source_id=$1 ORDER BY position',[source.id]),originalLinks);
  await db.query(restore,[versions[0]]);
 }
 const context={resolve:async()=>['owner']};
 const published={getPublicDocument:async(application,key,locale,version)=>{const n=Number(key.slice(3));return {version:{id:versions[n]},contentHash:'a'.repeat(64),artifacts:{html:{url:'https://legal.test/doc'}}};}};
 const svc=new ExternalAcceptanceService(db,registry,context,published,new LegalAcceptanceValidationService(config,db));
 const collector={issuer:'http://localhost:4000',clientId:'balanz-billing-service',role:'collector'};
 const validator={issuer:'http://localhost:4000',clientId:'billing-legal-service',role:'validator'};
 const prepare={subjectId:subject,organizationId:organization,sessionId,idempotencyKey:randomUUID()};
 const prepared=await Promise.all(Array.from({length:8},()=>svc.prepare(collector,prepare)));
 assert.equal(new Set(prepared.map(p=>p.requestId)).size,1);
 const request=prepared[0];
 const input={requestId:request.requestId,subjectId:subject,organizationId:organization,sessionId,idempotencyKey:randomUUID(),confirmations:request.documents.map(d=>({documentVersionId:d.documentVersionId,contentHash:d.contentHash,accepted:true}))};
 const accepted=await Promise.all(Array.from({length:8},()=>svc.accept(collector,input)));
 assert.equal(new Set(accepted.map(a=>a.legalAcceptanceId)).size,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM acceptances'))[0].n,3);
 assert.equal((await svc.accept(collector,input)).legalAcceptanceId,accepted[0].legalAcceptanceId);
 await assert.rejects(svc.accept(collector,{...input,confirmations:input.confirmations.map((c,i)=>({...c,contentHash:i===0?'b'.repeat(64):c.contentHash}))}),e=>e.status===409);
 const validation={subjectId:subject,organizationId:organization,productCode:'balanz_cfdi',legalAcceptanceId:accepted[0].legalAcceptanceId};
 const proof=await svc.validate(validator,validation);assert.equal(proof.valid,true);assert.equal(proof.contractVersion,2);assert.equal(proof.identityIssuer,'urn:hemia:balanz');
 await assert.rejects(svc.validate(validator,{...validation,subjectId:randomUUID()}),e=>e.status===403);
 await assert.rejects(svc.validate(validator,{...validation,organizationId:randomUUID()}),e=>e.status===403);
 await assert.rejects(svc.validate({...validator,clientId:'other'},validation),e=>e.status===403);
 await db.query('UPDATE document_versions SET content_hash=$1 WHERE id=$2',['b'.repeat(64),versions[1]]);assert.equal((await svc.validate(validator,validation)).valid,false);
 await db.query('UPDATE document_versions SET content_hash=$1 WHERE id=$2',['a'.repeat(64),versions[1]]);
 const stale=await svc.prepare(collector,{...prepare,idempotencyKey:randomUUID()});
 await db.query("UPDATE external_acceptance_requests SET expires_at=now()-interval '1 second' WHERE id=$1",[stale.requestId]);
 await assert.rejects(svc.accept(collector,{...input,requestId:stale.requestId,idempotencyKey:randomUUID()}),e=>e.status===409);
 await registry.disable({actor},source.id);
 await assert.rejects(svc.validate(validator,validation),e=>e.status===403);
 assert.equal((await db.query('SELECT count(*)::int n FROM acceptances'))[0].n,3);
 await assert.rejects(db.undoLastMigration(),/forward-only/);
 assert.equal((await db.query('SELECT count(*)::int n FROM acceptances'))[0].n,3);
 await db.query('UPDATE external_identity_sources SET enabled=true WHERE id=$1',[source.id]);
 await svc.prepare(collector,{...prepare,idempotencyKey:randomUUID()});
 await systems.save({...await systems.get(systemId),clients,enabled:false},actor,systemId);
 await assert.rejects(svc.prepare(collector,{...prepare,idempotencyKey:randomUUID()}),e=>e.status===403);
 await systems.saveCapability({code:'delivery',name:'Entrega',functions:[],schema:{fields:[{key:'mode',label:'Modo',type:'string',options:['test','live'],required:true},{key:'attempts',label:'Intentos',type:'integer',min:0,max:10},{key:'endpoint',label:'Servicio de entrega',type:'string',format:'service',required:true}]}},actor);
 const second=await systems.save({code:'demo',name:'Demo',enabled:true,services:[{...services[0],url:'http://localhost:3021/custom/verify'}],configuration:{legalAcceptances:{...settings,identityIssuer:'urn:hemia:demo',productCode:'demo'},delivery:{mode:'test',attempts:0,endpoint:'legal-context'}},clients},actor);
 const unbound=await systems.save({code:'unbound',name:'Prepared backend',enabled:true,services,configuration:{legalAcceptances:{...settings,identityIssuer:'urn:hemia:unbound',productCode:'unbound'}},clients:[]},actor);
 await assert.rejects(registry.saveFromCatalog(catalogRequest,{systemId:unbound.id,applicationId:app,documentIds:docs}),e=>e.status===400);
 assert.equal((await db.query('SELECT count(*)::int n FROM external_identity_sources WHERE system_id=$1',[unbound.id]))[0].n,0);
 const validatorOnly=await systems.save({code:'validation_only',name:'Evidence validator',enabled:true,services:[],configuration:{legalAcceptances:{}},clients:[clients[1]]},actor);
 assert.equal((await db.query('SELECT count(*)::int n FROM external_identity_sources WHERE system_id=$1',[validatorOnly.id]))[0].n,0);
 await assert.rejects(registry.saveFromCatalog(catalogRequest,{systemId:validatorOnly.id,applicationId:app,documentIds:docs}),e=>e.status===400);
 const created=await registry.save({actor},{systemId:second.id,applicationId:app,documentIds:docs});
 assert.equal(created.contextUrl,'http://localhost:3021/custom/verify');
 assert.equal((await registry.authorize(collector,organization,created.id)).context_url,'http://localhost:3021/custom/verify');
 await systems.save({...await systems.get(systemId),clients,enabled:true},actor,systemId);
 assert.equal((await registry.authorize(collector,organization,source.id)).context_url,legacySettings.contextUrl);
 await systems.save({...second,enabled:false},actor,second.id);
 await assert.rejects(registry.authorize(collector,organization,created.id),e=>e.status===403);
 await assert.rejects(registry.save({actor},{systemId:second.id,applicationId:app,documentIds:docs},created.id),e=>e.status===400);
 await systems.save(second,actor,second.id);
 assert.equal(created.issuerId,issuer);assert.equal(created.systemId,second.id);assert.equal(created.productCode,'demo');
 await assert.rejects(systems.save({...second,services:[{...services[0],enabled:false}]},actor,second.id),e=>e.status===400);
 await assert.rejects(systems.save({...second,services:[]},actor,second.id),e=>e.status===400);
 await assert.rejects(systems.save({...second,configuration:{...second.configuration,delivery:{mode:'invalid'}}},actor,second.id),e=>e.status===400);
 await systems.saveCapability({code:'notifications',name:'Notificaciones',schema:{fields:[]},functions:[{code:'sender',name:'Enviar mensajes',scopes:[{code:'notifications.messages.send',audience:'notifications-api'}]}]},actor);
 const generic=await systems.save({code:'notifications_gateway',name:'Gateway de notificaciones',enabled:true,configuration:{notifications:{}},services:[],clients:[genericClient]},actor);
 assert.equal((await systems.clients(generic.id))[0].capabilityCode,'notifications');
 const mixed=await systems.get(systemId);
 await systems.save({...mixed,configuration:{...mixed.configuration,notifications:{}},clients:[...clients,genericClient]},actor,systemId);
 assert.equal((await db.query('SELECT count(*)::int n FROM external_identity_source_clients WHERE source_id=$1 AND client_id=$2',[systemId,genericClient.clientId]))[0].n,0);
 assert.equal((await db.query('SELECT id FROM external_identity_source_clients WHERE source_id=$1 AND client_id=$2',[systemId,'balanz-billing-service']))[0].id,originalClientId);
 console.log('PASS generic non-Legal functions, scoped client assignments and isolated legacy Legal source synchronization');
 console.log('PASS PostgreSQL catalog backfill, stable historical clients, forward-only rollback protection, system disablement, concurrent preparation and acceptance, lost response, payload conflict, source/user/org/client isolation, expiry, changed documents, v2 evidence, per-system service resolution and disabled service rejection');
 }finally{await db.destroy();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
