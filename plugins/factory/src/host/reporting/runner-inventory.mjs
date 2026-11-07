function boundSnapshot(config,data) {
  if(data.version!==1||data.host!==config.host||data.pool!==(config.os??'macos'))return false;
  const slots=data.slots;
  return Array.isArray(slots)&&slots.length===config.slots&&new Set(slots.map(s=>s.slot)).size===config.slots;
}
function slotRows(config,data,source) {
  let complete=true;
  const inventory=data.slots.map(row=>{
    const allowed=row.projectId===null||source.projectIds.includes(row.projectId);
    if(!allowed||!Number.isInteger(row.slot)||row.slot<0||row.slot>=config.slots)complete=false;
    return {slot:row.slot,phase:allowed?row.phase:'unknown',projectId:allowed?row.projectId:null,runnerId:allowed?(row.runnerId??null):null};
  });
  return {inventory,complete};
}
function uncertainRows(data,source) {
  const rows=Array.isArray(data.uncertain)?data.uncertain:[];
  return rows.filter(row=>source.projectIds.includes(row.projectId)).slice(0,64)
    .map(row=>({projectId:row.projectId,runnerId:row.runnerId??null}));
}
export function dispatcherInventory(config,state,source,active) {
  const data=state.runnerInventory;
  if(!data)return {};
  if(!boundSnapshot(config,data))return {inventoryComplete:false,inventory:[],uncertainRegistrations:[]};
  const {inventory,complete}=slotRows(config,data,source);
  const certain=Array.isArray(data.uncertain)&&data.uncertain.length===0&&!data.overflow;
  return {inventoryComplete:active===true&&data.complete===true&&complete&&certain,
    inventory,uncertainRegistrations:uncertainRows(data,source)};
}
