const {randomUUID}=require('node:crypto');
module.exports={async up(q){
 for(const name of ['MASTERS-APP','MASTERS-READ','MASTERS-MANAGE','MASTERS-ADMIN'])await q.sequelize.query("INSERT INTO app_permissions(name,appname,enabled) VALUES(:name,'MASTERS',true) ON CONFLICT(name) DO NOTHING",{replacements:{name}});
 await q.sequelize.query("INSERT INTO app_applications(application_name,application_icon,required_permission) VALUES('MASTERS','bi-diagram-3','MASTERS-APP') ON CONFLICT(application_name) DO NOTHING");
 await q.sequelize.query("INSERT INTO app_application_navigation(application_name,landing_route,navbar_items) VALUES('MASTERS','/masters',:items) ON CONFLICT(application_name) DO NOTHING",{replacements:{items:JSON.stringify([{label:'Shared masters',link:'/masters',icon:'bi-diagram-3',permission:'MASTERS-READ'}])}});
 for(const [module,names] of [['units',['Each','Set','Meter','Liter','Kilogram']],['currencies',['USD']]])for(const name of names)await q.sequelize.query("INSERT INTO app_shared_masters(id,module,name,code) SELECT :id,:module,:name,:name WHERE NOT EXISTS(SELECT 1 FROM app_shared_masters WHERE module=:module AND code=:name AND organization_id IS NULL)",{replacements:{id:randomUUID(),module,name}});
},async down(){throw new Error('Customized workspace/master definitions are retained');}};
