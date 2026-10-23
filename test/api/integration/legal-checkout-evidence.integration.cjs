const { createRequire } = require('node:module');
const apiRequire = createRequire(require('node:path').resolve(__dirname, '../../../apps/api/package.json'));
const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
module.exports=async(ds,request,config,org,issuer,apps,urls)=>{
 await ds.query("UPDATE applications SET status='active' WHERE id=$1",[apps[0]]);
 const docs=[],versions=[],rules=[],acceptances=[];
 for(let n=0;n<3;n++){
  const d=randomUUID(),v=randomUUID(),r=randomUUID(),a=randomUUID();docs.push(d);versions.push(v);rules.push(r);acceptances.push(a);
  await ds.query("INSERT INTO documents(id,issuer_id,application_id,key,locale,title) VALUES($1::uuid,$2,$3,$1::text,'es-MX','Checkout test')",[d,issuer[0],apps[0]]);
  await ds.query("INSERT INTO document_versions(id,document_id,version,status,content_hash) VALUES($1,$2,'1.0.0','published',$3)",[v,d,'a'.repeat(64)]);
  await ds.query("INSERT INTO acceptance_rules(id,document_id,version_id,issuer_id,application_id,organization_id,acceptance_mode) VALUES($1,$2,$3,$4,$5,$6,'individual')",[r,d,v,issuer[0],apps[0],org[0]]);
  await ds.query("INSERT INTO acceptances(id,issuer_id,application_id,organization_id,identity_issuer,subject_id,document_id,document_version_id,acceptance_rule_id,accepted_by_identity_issuer,accepted_by_subject_id,acceptance_mode,content_hash,accepted_at) VALUES($1,$2,$3,$4,'https://identity.test','ana',$5,$6,$7,'https://identity.test','ana','individual',$8,now())",[a,issuer[0],apps[0],org[0],d,v,r,'a'.repeat(64)]);
 }
 config.LEGAL_CHECKOUT_CONTRACTS=JSON.stringify({billing:{issuerId:issuer[0],applicationId:apps[0],termsDocumentId:docs[0],privacyDocumentId:docs[1],refundPolicyDocumentId:docs[2]}});
 await ds.query(`INSERT INTO legal_service_clients(oauth_issuer,client_id,enabled,policy) VALUES($1,$2,true,$3)`, ['https://identity.test','billing-legal-service',JSON.stringify({grants:[{operation:'legal.acceptances.validate',issuerId:issuer[0],applicationId:apps[0],organizationIds:[org[0]]}]})]);
 const input={issuerId:issuer[0],applicationId:apps[0],organizationId:org[0],identityIssuer:'https://identity.test',subjectId:'ana',productCode:'billing',legalAcceptanceId:acceptances[0]};
 const call=(body=input,token='validator')=>request('acceptances/validate','POST',body,token);
 const ok=await call();assert.equal(ok.status,200);assert.equal(ok.body.valid,true);assert.equal(ok.body.evidence.length,3);assert.match(ok.body.legalSnapshotHash,/^[a-f0-9]{64}$/);assert.equal((await call()).body.legalSnapshotHash,ok.body.legalSnapshotHash);

 if(process.env.BILLING_API_ROOT){
  const {HemiaLegalClientService}=require(require('node:path').resolve(process.env.BILLING_API_ROOT,'src/modules/checkout/clients/hemia-legal-client.service'));
  const {ConfigService}=apiRequire('@nestjs/config');
  const billing=new HemiaLegalClientService(new ConfigService({hemiaLegal:{baseUrl:urls.legalUrl,tokenUrl:urls.identityUrl+'/oauth/token',clientId:'billing-legal-service',clientSecret:'test-secret',identityIssuer:input.identityIssuer,products:JSON.stringify({billing:{issuerId:issuer[0],applicationId:apps[0]}})}}));
  // Billing requires a UUID user id, as do its checkout DTOs.
  const user=require('node:crypto').randomUUID();await ds.query('UPDATE acceptances SET subject_id=$1,accepted_by_subject_id=$1 WHERE id=ANY($2::uuid[])',[user,acceptances]);
  const result=await billing.validateAcceptance({organizationId:org[0],userId:user,legalAcceptanceId:acceptances[0],productCode:'billing'});assert.equal(result.valid,true);assert.equal(result.raw.evidence.length,3);
  await ds.query('UPDATE acceptances SET subject_id=$1,accepted_by_subject_id=$1 WHERE id=ANY($2::uuid[])',['ana',acceptances]);
  await assert.rejects(billing.validateAcceptance({organizationId:org[0],userId:user,legalAcceptanceId:acceptances[0],productCode:'billing'}),e=>e.status===400);
  console.log('PASS actual Billing OAuth client -> Legal HTTP -> PostgreSQL evidence; missing evidence blocks checkout client');
 }
 assert.equal((await call(input,'machine')).status,403);assert.equal((await call(input,'human')).status,401);assert.equal((await call(input,'revoked')).status,401);
 assert.equal((await call({...input,applicationId:apps[1]})).status,403);assert.equal((await call({...input,organizationId:org[1]})).status,403);
 assert.equal((await call({...input,roles:['admin']})).status,400);
 for(const body of [{...input,subjectId:'other'},{...input,legalAcceptanceId:randomUUID()}])assert.equal((await call(body)).body.valid,false);
 await ds.query("UPDATE acceptances SET content_hash=$1 WHERE id=$2",['b'.repeat(64),acceptances[1]]);assert.equal((await call()).body.valid,false);
 await ds.query("UPDATE acceptances SET content_hash=$1 WHERE id=$2",['a'.repeat(64),acceptances[1]]);
 await ds.query("UPDATE document_versions SET effective_until=now()-interval '1 second' WHERE id=$1",[versions[1]]);assert.equal((await call()).body.valid,false);
 await ds.query('UPDATE document_versions SET effective_until=NULL WHERE id=$1',[versions[1]]);
 await ds.query("UPDATE acceptance_rules SET status='inactive' WHERE id=$1",[rules[1]]);assert.equal((await call()).body.valid,false);
 await ds.query("UPDATE acceptance_rules SET status='active' WHERE id=$1",[rules[1]]);
 await ds.query("UPDATE documents SET status='archived' WHERE id=$1",[docs[2]]);assert.equal((await call()).body.valid,false);
 await ds.query("UPDATE documents SET status='active' WHERE id=$1",[docs[2]]);
 await ds.query('DELETE FROM acceptances WHERE id=$1',[acceptances[2]]);assert.equal((await call()).body.valid,false);
 assert.equal((await call({...input,productCode:'unconfigured'})).status,503);
 assert.equal((await ds.query('SELECT count(*)::int n FROM acceptances WHERE id=ANY($1::uuid[])',[acceptances]))[0].n,2,'validation never inserts acceptance');
 console.log('PASS checkout evidence HTTP/PostgreSQL: three explicit documents, bound identity/org/product, scopes, hash, expiry, missing acceptance, read-only and deterministic snapshot');
};
