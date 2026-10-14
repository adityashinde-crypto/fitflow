const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const KEY="FITFLOW_LOCAL_V1";
let state=JSON.parse(localStorage.getItem(KEY)||"null");
let onboardingStep=1, workoutIndex=0, workoutTimer=null, workoutSeconds=0;
let coachHistory=[];

const defaultState=()=>({
  loggedIn:false,user:null,profile:null,plan:null,progress:[],meals:[],checkins:[],theme:"dark"
});
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2400)}
function initials(name){return (name||"A").slice(0,1).toUpperCase()}
function calc(p){
  if(!p||!p.age||!p.height||!p.weight)return {};
  const gender=(p.gender||"").toLowerCase();
  const bmr=10*p.weight+6.25*p.height-5*p.age+(gender==="female"?-161:gender==="male"?5:-78);
  const mult={sedentary:1.2,light:1.375,moderate:1.55,high:1.725}[p.activity]||1.375;
  const maintenance=bmr*mult;
  let adj=0;
  if(p.goal==="fat_loss")adj=-Math.min(Math.max(maintenance*.15,250),750);
  if(["muscle_gain","weight_gain"].includes(p.goal))adj=Math.min(Math.max(maintenance*.08,150),400);
  const calories=Math.max(1200,Math.round(maintenance+adj));
  const protein=Math.round(p.weight*(["fat_loss","muscle_gain","weight_gain","recomp"].includes(p.goal)?1.6:1.4));
  const baseline=Number(p.steps)||5000;
  const stepTarget=Math.max(baseline,Math.min(12000,baseline+1000));
  const diff=p.goalWeight?Number((p.goalWeight-p.weight).toFixed(1)):0;
  return {bmr:Math.round(bmr),maintenance:Math.round(maintenance),calories,protein,stepTarget,diff};
}
const FOOD_LIBRARY={
  protein:{
    Vegetarian:['Paneer','Greek yogurt','Curd','Milk','Whey protein','Tofu','Soy chunks','Dal','Rajma','Chole','Moong dal','Masoor dal','Sprouts','Peanuts','Almonds','Cashews'],
    NonVegetarian:['Eggs','Chicken','Fish','Prawns','Lean mutton'],
    Vegan:['Tofu','Tempeh','Soy chunks','Soy milk','Pea protein','Dal','Rajma','Chole','Moong dal','Masoor dal','Sprouts','Peanuts','Almonds','Cashews']
  },
  carbs:['Rice','Brown rice','Roti','Chapati','Multigrain roti','Oats','Poha','Upma','Idli','Dosa','Potato','Sweet potato','Quinoa','Bread'],
  produce:['Spinach','Broccoli','Carrot','Cucumber','Tomato','Capsicum','Beans','Cauliflower','Peas','Lettuce','Onion','Mushroom','Banana','Apple','Orange','Mango','Papaya','Watermelon','Berries'],
  extras:['Olive oil','Ghee','Peanut butter','Seeds','Nuts','Coconut','Buttermilk','Coffee','Tea','Lemon water']
};
function selectedFoods(p,key){return Array.isArray(p[key])&&p[key].length?p[key]:[]}
function makeExerciseBank(p){
  const style=p.trainingStyle||'Mixed', loc=p.location||'Gym';
  const gym=[['Squat / Leg Press','3 × 8–12','Quads + glutes'],['Bench Press / Push-ups','3 × 8–12','Chest + triceps'],['Lat Pulldown / Pull-ups','3 × 8–12','Back + biceps'],['Romanian Deadlift','3 × 8–12','Hamstrings + glutes'],['Overhead Press','3 × 8–12','Shoulders'],['Cable / Dumbbell Row','3 × 8–12','Upper back'],['Walking Lunges','3 × 10 / leg','Legs + stability'],['Plank','3 × 30–60 sec','Core']];
  const body=[['Bodyweight Squat','3 × 12–20','Legs'],['Push-ups','3 × 8–15','Chest + triceps'],['Inverted Row / Pull-up','3 × 6–12','Back + biceps'],['Glute Bridge','3 × 12–20','Glutes'],['Pike Push-up','3 × 6–12','Shoulders'],['Reverse Lunge','3 × 10 / leg','Legs'],['Mountain Climbers','3 × 30 sec','Conditioning'],['Plank','3 × 30–60 sec','Core']];
  const run=[['Easy Run','10–15 min','Aerobic base'],['Strides','6 × 20 sec','Running speed'],['Walking Lunges','3 × 10 / leg','Leg strength'],['Push-ups','3 × 10–15','Upper body'],['Single-leg Calf Raise','3 × 15 / leg','Calves'],['Plank','3 × 45 sec','Core']];
  return style==='Weights'?gym:style==='Bodyweight'?body:style==='Running'?run:gym;
}
function buildWorkoutWeek(p){
  const days=Number(p.days)||3, mins=Number(p.minutes)||45, level=p.level||'Beginner', bank=makeExerciseBank(p);
  const labels=['DAY 1','DAY 2','DAY 3','DAY 4','DAY 5','DAY 6','DAY 7'];
  const focus=days<=2?['FULL BODY','FULL BODY']:days===3?['FULL BODY A','FULL BODY B','FULL BODY C']:days===4?['UPPER','LOWER','UPPER','LOWER']:days===5?['PUSH','PULL','LEGS','UPPER','CONDITIONING']:['PUSH','PULL','LEGS','UPPER','LOWER','CONDITIONING','FULL BODY'];
  return Array.from({length:days},(_,i)=>({day:i+1,label:labels[i],focus:focus[i],mins,exercises:bank.slice(0, Math.min(bank.length, level==='Beginner'?6:8)).map((e,j)=>({name:e[0],sets:i%2&&j===0?'3 × 10–12':e[1],target:e[2]}))}));
}
function buildDietWeek(p,c){
  const prot=selectedFoods(p,'proteinSources'), carbs=selectedFoods(p,'carbSources'), produce=selectedFoods(p,'produceSources');
  const P=prot.length?prot:['Paneer','Dal','Greek yogurt']; const C=carbs.length?carbs:['Rice','Roti','Oats']; const V=produce.length?produce:['Spinach','Cucumber','Tomato','Banana','Apple'];
  const meals=Number(p.mealCount)||4, cal=c.calories||2000;
  const pick=(arr,i)=>arr[i%arr.length];
  const days=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
  return days.map((day,i)=>{
    if(i===6)return {day,cheat:true,items:[`Breakfast: ${pick(P,i)} + ${pick(C,i)} + ${pick(V,i)}`,`Lunch: Flexible cheat meal — enjoy your preferred meal, keep portions sensible`,`Snack: Fruit + ${pick(P,i+1)}`,`Dinner: ${pick(P,i+2)} + ${pick(V,i+2)} + ${pick(C,i+2)}`]};
    const variations=[
      [`Breakfast: ${pick(C,i)} oats + ${pick(P,i)} + ${pick(V,i)}`,`Lunch: ${pick(P,i+1)} + ${pick(C,i+1)} + ${pick(V,i+1)}`,`Snack: ${pick(V,i+2)} + ${pick(P,i+2)}`,`Dinner: ${pick(P,i+3)} + ${pick(C,i+2)} + ${pick(V,i+3)}`],
      [`Breakfast: ${pick(C,i+1)} + ${pick(P,i+1)} + ${pick(V,i+1)}`,`Lunch: ${pick(P,i+2)} bowl + ${pick(C,i)} + ${pick(V,i+2)}`,`Snack: ${pick(P,i+3)} + ${pick(V,i+3)}`,`Dinner: ${pick(P,i)} + ${pick(C,i+1)} + ${pick(V,i)}`]
    ];
    return {day,cheat:false,items:variations[i%2],target:Math.round(cal)};
  });
}
function buildPlan(p,c){
  const workoutWeek=buildWorkoutWeek(p), dietWeek=buildDietWeek(p,c);
  return {split:workoutWeek[0]?.focus||'FULL BODY',mins:Number(p.minutes)||45,days:workoutWeek.length,workoutWeek,exercises:workoutWeek[0]?.exercises||[],dietWeek};
}
function showScreen(id){["authScreen","onboarding","app","adminApp"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id))}
function openApp(){showScreen("app");$("#userName").textContent=(state.user||"ATHLETE").toUpperCase();$("#avatar").textContent=initials(state.user);renderAll();page("home")}
function register(e){
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.target));
  const users=JSON.parse(localStorage.getItem("FITFLOW_USERS")||"{}");
  if(users[d.username]) return $("#registerError").textContent="That username is already registered.";
  if(d.password.length<6||!/[^\w\s]/.test(d.password))return $("#registerError").textContent="Password needs 6+ characters and a special character.";
  if(d.password!==d.confirm)return $("#registerError").textContent="Passwords do not match.";
  state=defaultState();state.user=d.username;state.password=d.password;state.createdAt=new Date().toISOString();state.accountStatus="active";state.loggedIn=true;
  save();showScreen("onboarding");toast("Account created. Let's build your profile.");wizardTab="workout";wizardStep={workout:1,diet:1};renderOnboarding();
}
function login(e){
  e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
  const users=JSON.parse(localStorage.getItem("FITFLOW_USERS")||"{}");
  if(users[d.username] && users[d.username]===d.password){
    state=JSON.parse(localStorage.getItem("FITFLOW_"+d.username)||"null")||defaultState();
    if(state.accountStatus==="suspended")return $("#loginError").textContent="This account is currently suspended. Contact an administrator.";
    state.loggedIn=true;state.user=d.username;save();openApp();
  } else $("#loginError").textContent="Account not found or password is incorrect. Register first.";
}
function bindAuth(){
  $$(".auth-role-tabs button").forEach(b=>b.onclick=()=>{
    $$(".auth-role-tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
    const role=b.dataset.role, isUser=role==="user";
    $("#userAuth").classList.toggle("hidden",!isUser);$("#adminAuth").classList.toggle("hidden",isUser);
    $$(".auth-tabs button").forEach(x=>x.classList.remove("active"));
    $$(".auth-tabs button")[0].classList.add("active");
    $("#loginForm").classList.remove("hidden");$("#registerForm").classList.add("hidden");
    $("#adminLoginForm").classList.remove("hidden");$("#adminRegisterForm").classList.add("hidden");
  });
  $$(".auth-tabs button").forEach(b=>b.onclick=()=>{
    $$(".auth-tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
    const role=$(".auth-role-tabs button.active")?.dataset.role||"user";
    if(role==="user"){
      $("#loginForm").classList.toggle("hidden",b.dataset.auth!=="login");$("#registerForm").classList.toggle("hidden",b.dataset.auth!=="register");
    }else{
      $("#adminLoginForm").classList.toggle("hidden",b.dataset.auth!=="login");$("#adminRegisterForm").classList.toggle("hidden",b.dataset.auth!=="register");
    }
  });
  $("#loginForm").onsubmit=login;$("#registerForm").onsubmit=register;
  $("#adminLoginForm").onsubmit=adminLogin;$("#adminRegisterForm").onsubmit=adminRegister;
}

function adminStore(){return JSON.parse(localStorage.getItem("FITFLOW_ADMIN_USERS")||"{}")}
function saveAdminStore(a){localStorage.setItem("FITFLOW_ADMIN_USERS",JSON.stringify(a))}
function seedAdmin(){
  const admins=adminStore();
  if(!Object.keys(admins).length){admins.admin={password:"admin123!",createdAt:new Date().toISOString()};saveAdminStore(admins)}
}
function adminRegister(e){
  e.preventDefault();const d=Object.fromEntries(new FormData(e.target)),admins=adminStore();
  if(d.code!=="FITFLOW-ADMIN")return $("#adminRegisterError").textContent="Invalid admin access code.";
  if(admins[d.username])return $("#adminRegisterError").textContent="That admin username already exists.";
  if(d.password.length<6||!/[^\w\s]/.test(d.password))return $("#adminRegisterError").textContent="Password needs 6+ characters and a special character.";
  if(d.password!==d.confirm)return $("#adminRegisterError").textContent="Passwords do not match.";
  admins[d.username]={password:d.password,createdAt:new Date().toISOString()};saveAdminStore(admins);
  toast("Admin account created. You can now log in.");
  $("#adminLoginForm").classList.remove("hidden");$("#adminRegisterForm").classList.add("hidden");
  $$(".auth-tabs button").forEach(x=>x.classList.toggle("active",x.dataset.auth==="login"));
}
function adminLogin(e){
  e.preventDefault();const d=Object.fromEntries(new FormData(e.target)),admins=adminStore();
  if(admins[d.username]&&admins[d.username].password===d.password){localStorage.setItem("FITFLOW_ADMIN_SESSION",d.username);openAdminApp()}
  else $("#adminLoginError").textContent="Admin account not found or password is incorrect.";
}
function allUsers(){
  const creds=JSON.parse(localStorage.getItem("FITFLOW_USERS")||"{}");
  return Object.keys(creds).map(username=>{
    const s=JSON.parse(localStorage.getItem("FITFLOW_"+username)||"null")||{};
    return {...s,user:username,username,accountStatus:s.accountStatus||"active"};
  });
}
function adminStats(){
  const users=allUsers();
  const countBy=k=>users.reduce((o,u)=>{const v=(u.profile?.[k]||"Not set").toString();o[v]=(o[v]||0)+1;return o},{});
  return {users,countBy};
}
function fmtDate(d){if(!d)return"—";try{return new Date(d).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}catch{return"—"}}
function adminMetric(label,value,note){return `<div class="metric"><span>${label}</span><b>${value}</b><small>${note}</small></div>`}
function renderBreakdown(id,data){
  const el=$("#"+id);if(!el)return;
  const entries=Object.entries(data).sort((a,b)=>b[1]-a[1]);
  el.innerHTML=entries.length?entries.map(([k,v])=>`<div class="break-row"><div><b>${k.replaceAll("_"," ")}</b><span>${v} ${v===1?"athlete":"athletes"}</span></div><div class="break-bar"><i style="width:${Math.max(6,Math.round(v/(Math.max(...entries.map(x=>x[1]))||1)*100))}%"></i></div></div>`).join(""):`<p>No athlete data yet.</p>`;
}
function renderAdmin(){
  const {users,countBy}=adminStats(), active=users.filter(u=>u.accountStatus!=="suspended").length, suspended=users.length-active;
  $("#adminMetrics").innerHTML=[
    adminMetric("REGISTERED USERS",users.length,"Total athlete accounts"),
    adminMetric("ACTIVE USERS",active,"Available to log in"),
    adminMetric("SUSPENDED",suspended,"Restricted accounts"),
    adminMetric("CHECK-INS",users.reduce((n,u)=>n+(u.checkins?.length||0),0),"Weekly submissions")
  ].join("");
  $("#adminAnalyticsMetrics").innerHTML=[
    adminMetric("PLANS BUILT",users.filter(u=>u.plan).length,"Users with generated plans"),
    adminMetric("PROGRESS LOGS",users.reduce((n,u)=>n+(u.progress?.length||0),0),"Recorded progress entries"),
    adminMetric("FOOD LOGS",users.reduce((n,u)=>n+(u.meals?.length||0),0),"Food entries"),
    adminMetric("ADMINS",Object.keys(adminStore()).length,"Admin accounts")
  ].join("");
  const recent=[...users].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,5);
  $("#adminRecentUsers").innerHTML=recent.length?recent.map(u=>`<button class="admin-user-row" data-admin-user="${u.username}"><span class="avatar mini">${initials(u.username)}</span><span><b>${u.username}</b><small>${fmtDate(u.createdAt)} • ${(u.profile?.goal||"Profile pending").replaceAll("_"," ")}</small></span><i>→</i></button>`).join(""):`<p>No registered athletes yet.</p>`;
  $$("#adminRecentUsers [data-admin-user]").forEach(b=>b.onclick=()=>showAdminUser(b.dataset.adminUser));
  renderBreakdown("adminGoalBreakdown",countBy("goal"));renderBreakdown("adminLocationBreakdown",countBy("location"));
  renderBreakdown("adminDietBreakdown",countBy("dietType"));renderBreakdown("adminLevelBreakdown",countBy("level"));
  const workoutUsers=users.filter(u=>u.plan?.workoutWeek),nutritionUsers=users.filter(u=>u.plan?.dietWeek);
  $("#adminWorkoutPlansCount").textContent=workoutUsers.length;$("#adminNutritionPlansCount").textContent=nutritionUsers.length;
  $("#adminWorkoutPlanList").innerHTML=workoutUsers.length?workoutUsers.slice(0,10).map(u=>`<button class="admin-plan-row" data-admin-user="${u.username}"><b>${u.username}</b><span>${u.plan.workoutWeek.length} days • ${u.profile?.minutes||45} min</span><i>VIEW →</i></button>`).join(""):`<p>No workout plans generated yet.</p>`;
  $("#adminNutritionPlanList").innerHTML=nutritionUsers.length?nutritionUsers.slice(0,10).map(u=>`<button class="admin-plan-row" data-admin-user="${u.username}"><b>${u.username}</b><span>${u.plan.dietWeek.length} day nutrition plan</span><i>VIEW →</i></button>`).join(""):`<p>No nutrition plans generated yet.</p>`;
  $$("#admin-page-plans [data-admin-user]").forEach(b=>b.onclick=()=>showAdminUser(b.dataset.adminUser));
  renderAdminUsers();renderAdminCheckins();drawAdminChart();
}
function renderAdminUsers(){
  const q=($("#adminUserSearch")?.value||"").toLowerCase(), status=$("#adminStatusFilter")?.value||"all";
  const users=allUsers().filter(u=>{
    const hay=[u.username,u.profile?.goal,u.profile?.location,u.profile?.level,u.profile?.dietType].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(status==="all"||u.accountStatus===status);
  });
  const body=$("#adminUsersTable");if(!body)return;
  body.innerHTML=users.length?users.map(u=>{
    const p=u.profile||{};
    return `<tr><td><div class="table-user"><span class="avatar mini">${initials(u.username)}</span><div><b>${u.username}</b><small>${fmtDate(u.createdAt)}</small></div></div></td><td>${(p.goal||"Pending").replaceAll("_"," ")}</td><td>${p.age?p.age+"y • "+p.weight+"kg":"Pending"}</td><td>${p.location||"—"} • ${p.days||"—"}d</td><td><span class="status-pill ${u.accountStatus==="suspended"?"suspended":""}">${u.accountStatus}</span></td><td><div class="table-actions"><button class="mini-btn" data-view-user="${u.username}">VIEW</button><button class="mini-btn" data-toggle-user="${u.username}">${u.accountStatus==="suspended"?"ACTIVATE":"SUSPEND"}</button><button class="mini-btn danger" data-delete-user="${u.username}">DELETE</button></div></td></tr>`;
  }).join(""):`<tr><td colspan="6"><p>No users match your filters.</p></td></tr>`;
  $$("[data-view-user]").forEach(b=>b.onclick=()=>showAdminUser(b.dataset.viewUser));
  $$("[data-toggle-user]").forEach(b=>b.onclick=()=>toggleUser(b.dataset.toggleUser));
  $$("[data-delete-user]").forEach(b=>b.onclick=()=>deleteUser(b.dataset.deleteUser));
}
function toggleUser(username){
  const s=JSON.parse(localStorage.getItem("FITFLOW_"+username)||"null");if(!s)return;
  s.accountStatus=s.accountStatus==="suspended"?"active":"suspended";localStorage.setItem("FITFLOW_"+username,JSON.stringify(s));renderAdmin();toast(`${username} is now ${s.accountStatus}.`);
}
function deleteUser(username){
  if(!confirm(`Delete the FITFLOW account for ${username}? This removes the local demo data.`))return;
  localStorage.removeItem("FITFLOW_"+username);
  const users=JSON.parse(localStorage.getItem("FITFLOW_USERS")||"{}");delete users[username];localStorage.setItem("FITFLOW_USERS",JSON.stringify(users));
  renderAdmin();toast("User deleted.");
}
function showAdminUser(username){
  const u=allUsers().find(x=>x.username===username);if(!u)return;
  const p=u.profile||{},c=p.age?calc(p):{};
  $("#adminUserDetail").innerHTML=`<div class="admin-detail-head"><div class="avatar big">${initials(username)}</div><div><h2>${username}</h2><p>${u.accountStatus.toUpperCase()} • REGISTERED ${fmtDate(u.createdAt)}</p></div></div>
  <div class="admin-detail-grid">
    <div><span>GOAL</span><b>${(p.goal||"Pending").replaceAll("_"," ")}</b></div><div><span>AGE / BODY</span><b>${p.age||"—"}y • ${p.height||"—"}cm • ${p.weight||"—"}kg</b></div>
    <div><span>TRAINING</span><b>${p.location||"—"} • ${p.days||"—"} days • ${p.minutes||"—"} min</b></div><div><span>LEVEL</span><b>${p.level||"—"}</b></div>
    <div><span>DIET</span><b>${p.dietType||"—"}</b></div><div><span>TARGETS</span><b>${c.calories||"—"} kcal • ${c.protein||"—"}g protein</b></div>
    <div><span>PROGRESS</span><b>${u.progress?.length||0} entries</b></div><div><span>CHECK-INS</span><b>${u.checkins?.length||0} submissions</b></div>
  </div>
  <div class="admin-detail-section"><span class="eyebrow">SELECTED FOOD SOURCES</span><p>${[...(p.proteinSources||[]),...(p.carbSources||[]),...(p.produceSources||[])].slice(0,18).join(" • ")||"No food selections yet."}</p></div>
  <div class="admin-detail-section"><span class="eyebrow">LATEST CHECK-IN</span><p>${u.checkins?.length?`Weight: ${u.checkins.at(-1).weight||"—"} kg • Workout: ${u.checkins.at(-1).workout||"—"}% • Diet: ${u.checkins.at(-1).adherence||"—"}% • Energy: ${u.checkins.at(-1).energy||"—"}/10 • Stress: ${u.checkins.at(-1).stress||"—"}/10`:"No check-in submitted yet."}</p></div>
  <div class="modal-controls"><button class="btn btn-ghost" onclick="document.getElementById('adminUserModal').classList.add('hidden')">CLOSE</button><button class="btn btn-lime" onclick="toggleUser('${username.replace(/'/g,"\\\\'")}');document.getElementById('adminUserModal').classList.add('hidden')">${u.accountStatus==="suspended"?"ACTIVATE":"SUSPEND"} USER</button></div>`;
  $("#adminUserModal").classList.remove("hidden");
}
function renderAdminCheckins(){
  const rows=[];
  allUsers().forEach(u=>(u.checkins||[]).forEach(c=>rows.push({...c,username:u.username})));
  rows.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
  $("#adminCheckinsTable").innerHTML=rows.length?rows.slice(0,100).map(c=>`<tr><td><b>${c.username}</b></td><td>${fmtDate(c.date)}</td><td>${c.weight||"—"} kg</td><td>${c.workout||"—"}%</td><td>${c.adherence||"—"}%</td><td>${c.energy||"—"}/10</td><td>${c.stress||"—"}/10</td><td>${String(c.performance||c.difficulty||"—").slice(0,70)}</td></tr>`).join(""):`<tr><td colspan="8"><p>No check-ins yet.</p></td></tr>`;
}
function drawAdminChart(){
  const canvas=$("#adminUserChart");if(!canvas)return;
  const users=allUsers(), byDay={};
  users.forEach(u=>{const d=(u.createdAt||"").slice(0,10)||"unknown";if(d!=="unknown")byDay[d]=(byDay[d]||0)+1});
  const labels=Object.keys(byDay).sort(), vals=labels.map(k=>byDay[k]);
  const ctx=canvas.getContext("2d"),dpr=devicePixelRatio||1,w=canvas.clientWidth||600,h=290;
  canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  if(!vals.length){ctx.fillStyle="#6f7a73";ctx.font="12px Inter";ctx.fillText("No registration data yet.",20,40);return}
  const max=Math.max(...vals,1),min=0;ctx.strokeStyle="#c9ff32";ctx.lineWidth=3;ctx.beginPath();
  vals.forEach((v,i)=>{const x=30+i/(vals.length-1||1)*(w-60),y=h-35-((v-min)/(max-min||1))*(h-75);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
  vals.forEach((v,i)=>{const x=30+i/(vals.length-1||1)*(w-60),y=h-35-((v-min)/(max-min||1))*(h-75);ctx.fillStyle="#c9ff32";ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill()});
}
function openAdminApp(){
  showScreen("adminApp");
  const admin=localStorage.getItem("FITFLOW_ADMIN_SESSION")||"admin";
  $("#adminAvatar").textContent=initials(admin);$("#adminToday").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}).toUpperCase();
  renderAdmin();adminPage("overview");
}
function adminPage(name){
  $$("#adminApp .page").forEach(p=>p.classList.remove("active"));$("#admin-page-"+name).classList.add("active");
  $$("#adminApp .nav").forEach(n=>n.classList.toggle("active",n.dataset.adminPage===name));
  $("#adminCrumb").textContent=name.toUpperCase();window.scrollTo({top:0,behavior:"smooth"});
}
function adminLogout(){localStorage.removeItem("FITFLOW_ADMIN_SESSION");showScreen("authScreen");toast("Admin logged out.")}
let wizardTab="workout", wizardStep={workout:1,diet:1};
const wizardTotals={workout:10,diet:6};
const wizardData={};

function renderFoodChoices(){
  const type=wizardData.dietType||'Vegetarian';
  const vegan=FOOD_LIBRARY.protein.Vegan;
  let proteinGroups;
  if(type==='Non-vegetarian'){
    // Non-vegetarian users can choose from all three protein categories, shown separately.
    // Vegan foods are kept separate so the user can distinguish them from the broader vegetarian list.
    const vegetarianOnly=FOOD_LIBRARY.protein.Vegetarian.filter(x=>!vegan.includes(x));
    proteinGroups=[
      ['VEGETARIAN',vegetarianOnly],
      ['NON-VEGETARIAN',FOOD_LIBRARY.protein.NonVegetarian],
      ['VEGAN',vegan]
    ];
  }else if(type==='Vegan'){
    proteinGroups=[['VEGAN',vegan]];
  }else{
    proteinGroups=[['VEGETARIAN',FOOD_LIBRARY.protein.Vegetarian]];
  }

  const groups=[['proteinOptions',proteinGroups,'proteinSources'],['carbOptions',[['CARBS & STAPLES',FOOD_LIBRARY.carbs]],'carbSources'],['produceOptions',[['FRUIT, VEGETABLES & EXTRAS',[...FOOD_LIBRARY.produce,...FOOD_LIBRARY.extras]]],'produceSources']];
  groups.forEach(([id,categories,field])=>{
    const root=document.getElementById(id); if(!root)return;
    const selected=wizardData[field]||[];
    root.innerHTML=categories.map(([label,arr])=>`<div class="food-group"><div class="food-group-title">${label}</div><div class="food-group-options">${arr.map(x=>`<button type="button" class="food-choice ${selected.includes(x)?'selected':''}" data-food-field="${field}" data-food-value="${x}">${x}</button>`).join('')}</div></div>`).join('');
  });

  const avoidProtein=type==='Non-vegetarian'
    ? [...FOOD_LIBRARY.protein.Vegetarian,...FOOD_LIBRARY.protein.NonVegetarian,...FOOD_LIBRARY.protein.Vegan]
    : type==='Vegan' ? FOOD_LIBRARY.protein.Vegan : FOOD_LIBRARY.protein.Vegetarian;
  const avoidRoot=document.getElementById('avoidOptions');
  if(avoidRoot){
    const avoidSelected=wizardData.avoidFoods||[];
    const avoidFoods=[...new Set([...avoidProtein,...FOOD_LIBRARY.carbs,...FOOD_LIBRARY.produce])];
    avoidRoot.innerHTML=`<div class="food-group"><div class="food-group-title">FOODS TO AVOID</div><div class="food-group-options">${avoidFoods.map(x=>`<button type="button" class="food-choice ${avoidSelected.includes(x)?'selected':''}" data-food-field="avoidFoods" data-food-value="${x}">${x}</button>`).join('')}</div></div>`;
  }

  $$('.food-choice').forEach(b=>b.onclick=()=>{
    const f=b.dataset.foodField,v=b.dataset.foodValue,a=wizardData[f]||[];
    wizardData[f]=a.includes(v)?a.filter(x=>x!==v):[...a,v]; b.classList.toggle('selected',wizardData[f].includes(v));
  });
}
function renderOnboarding(){
  const total=wizardTotals[wizardTab], step=wizardStep[wizardTab];
  $$(".wizard-tab").forEach(b=>b.classList.toggle("active",b.dataset.wizard===wizardTab));
  $("#wizardWorkout").classList.toggle("hidden",wizardTab!=="workout");
  $("#wizardDiet").classList.toggle("hidden",wizardTab!=="diet");
  const track=wizardTab==="workout"?"#wizardWorkout":"#wizardDiet";
  $$(`${track} .wizard-question`).forEach(q=>q.classList.toggle("active",Number(q.dataset[wizardTab==="workout"?"wstep":"dstep"])===step));
  $("#onStep").textContent=`${wizardTab.toUpperCase()} · ${String(step).padStart(2,"0")} / ${String(total).padStart(2,"0")}`;
  $("#onProgress").style.width=(step/total*100)+"%";
  $("#onBack").style.visibility=(step===1 && wizardTab==="workout")?"hidden":"visible";
  $("#onNext").textContent=step===total?"FINISH / BUILD PLAN →":"CONTINUE →";
  updateWizardButtons();
  renderFoodChoices();
}
function setWizardField(name,value){
  wizardData[name]=value;
  const form=$("#onboardingForm"), field=form.elements[name];
  if(field) field.value=value;
  $$(`.choice[data-field="${name}"]`).forEach(b=>b.classList.toggle("selected",b.dataset.value===String(value)));
  if(name==="dietType") renderFoodChoices();
}
function updateWizardButtons(){
  $$(".wizard-question.active .choice").forEach(b=>b.classList.toggle("selected",wizardData[b.dataset.field]===b.dataset.value));
}
function nextWizard(){
  const total=wizardTotals[wizardTab], step=wizardStep[wizardTab];
  if(step<total){wizardStep[wizardTab]++;renderOnboarding();}
  else if(wizardTab==="workout"){wizardTab="diet";wizardStep.diet=1;renderOnboarding();}
  else finishOnboarding();
}
function prevWizard(){
  if(wizardStep[wizardTab]>1){wizardStep[wizardTab]--;renderOnboarding();}
  else if(wizardTab==="diet"){wizardTab="workout";wizardStep.workout=wizardTotals.workout;renderOnboarding();}
}
function wireSliders(){
  $$("[data-slider]").forEach(input=>{
    const out=$(`[data-out="${input.dataset.slider}"]`);
    if(out){out.textContent=input.value; input.oninput=()=>{out.textContent=input.value;wizardData[input.name]=input.value;}}
  });
}
function finishOnboarding(){
  const d=Object.fromEntries(new FormData($("#onboardingForm")));
  Object.assign(d,wizardData);
  if(!d.goal)return toast("Choose your primary workout goal.");
  d.gender=d.gender||"Male"; d.level=d.level||"Beginner"; d.activity=d.activity||"moderate"; d.location=d.location||"Gym"; d.dietType=d.dietType||"Vegetarian"; d.trainingStyle=d.trainingStyle||"Mixed";
  d.proteinSources=wizardData.proteinSources||[]; d.carbSources=wizardData.carbSources||[]; d.produceSources=wizardData.produceSources||[]; d.avoidFoods=wizardData.avoidFoods||[];
  ["age","height","weight","bodyFat","steps","sleep","days","minutes","water","pushups","pullups","squats","plank","lunges","trainingMonths","goalWeight"].forEach(k=>{if(d[k]!==""&&d[k]!=null)d[k]=Number(d[k])});
  d.age=d.age||19; d.height=d.height||175; d.weight=d.weight||70; d.days=d.days||3; d.minutes=d.minutes||45;
  d.steps=d.steps||5000; d.sleep=d.sleep||7; d.water=d.water||2;
  state.profile=d;state.plan=buildPlan(d,calc(d));state.progress=[{date:new Date().toISOString().slice(0,10),weight:d.weight,steps:d.steps}];state.createdAt=state.createdAt||new Date().toISOString();state.accountStatus=state.accountStatus||"active";
  state.password=state.password||dummyPassword();const users=JSON.parse(localStorage.getItem("FITFLOW_USERS")||"{}");users[state.user]=state.password;localStorage.setItem("FITFLOW_USERS",JSON.stringify(users));localStorage.setItem("FITFLOW_"+state.user,JSON.stringify(state));save();openApp();toast("FitFlow built your personalized system.");
}
function dummyPassword(){return "FITFLOW_LOCAL_DEMO"}
function page(name){
  $$(".page").forEach(p=>p.classList.remove("active"));$("#page-"+name).classList.add("active");
  $$(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===name));
  $("#crumb").textContent=name.toUpperCase();
  window.scrollTo({top:0,behavior:"smooth"});
  if(name==="progress")drawChart("progressChart",true);
}
function renderAll(){const p=state.profile||{},c=calc(p);state.plan=(!state.plan||!state.plan.workoutWeek)?buildPlan(p,c):state.plan;save();renderHome(p,c);renderWorkout(p,c);renderNutrition(p,c);renderProgress(p,c);renderCheckin();renderCoach(p,c);renderResearch();renderProfile(p,c);$("#today").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}).toUpperCase()}
function renderHome(p,c){
  const goal=p.goal||"maintenance";
  $("#mission").textContent=`${state.plan.split} / ${state.plan.mins} MIN`;
  $("#streakNum").textContent=String(Math.max(1,state.checkins.length+7)).padStart(2,"0");
  const metrics=[["CURRENT WEIGHT",p.weight?`${p.weight} KG`:"—","Starting point"],["CALORIE TARGET",c.calories?c.calories.toLocaleString():"—","Estimated"],["PROTEIN",c.protein?`${c.protein} G`:"—","Daily target"],["STEPS",c.stepTarget?c.stepTarget.toLocaleString():"—","Personalized"]];
  $("#homeMetrics").innerHTML=metrics.map(m=>`<div class="metric"><span>${m[0]}</span><b>${m[1]}</b><small>${m[2]}</small></div>`).join("");
  $("#workoutTeaser").textContent=`${state.plan.split} • ${state.plan.mins} minutes • ${p.days||3} days/week`;
  const signals=[
    ["⚡","TRAINING","Progress one variable at a time."],
    ["◒","NUTRITION",`Target ${c.calories||"—"} kcal / ${c.protein||"—"}g protein.`],
    ["☾","RECOVERY",`Sleep target: ${p.sleep||7}h. Stress: ${p.stress||"—"}.`],
    ["↗","ACTIVITY",`Step target: ${(c.stepTarget||0).toLocaleString()}/day.`]
  ];
  $("#signals").innerHTML=signals.map(s=>`<div class="signal"><div class="signal-icon">${s[0]}</div><div><b>${s[1]}</b><p>${s[2]}</p></div></div>`).join("");
  drawChart("weightChart");
}
function renderWorkout(p,c){
  const week=state.plan.workoutWeek||[];
  $('#workoutMeta').textContent=`${p.level||'Beginner'} • ${p.location||'Gym'} • ${week.length} days/week • ${p.minutes||45} minutes`;
  $('#sessionTitle').textContent=week[0]?.focus||'FULL BODY'; $('#sessionDuration').textContent=p.minutes||45;
  $('#workoutPlanSummary').textContent=`${week.length}-day ${p.trainingStyle||'Mixed'} training plan.`;
  $('#workoutDaysSummary').textContent=`Day 1 through Day ${week.length} are ready. Select a day to view the complete session.`;
  $('#weeklyWorkoutPlan').innerHTML=week.map((d,i)=>`<div class="week-day ${i===0?'active':''}" data-day-index="${i}"><div class="week-day-head"><span>${d.label}</span><b>${d.focus}</b><small>${d.mins} MIN</small></div><div class="week-exercises">${d.exercises.map((e,j)=>`<div class="exercise"><div class="num">${String(j+1).padStart(2,'0')}</div><h3>${e.name}</h3><div class="prescription">${e.sets}</div><p>${e.target}</p></div>`).join('')}</div></div>`).join('');
  $$('.week-day').forEach(el=>el.onclick=()=>{ $$('.week-day').forEach(x=>x.classList.remove('active'));el.classList.add('active'); const d=week[Number(el.dataset.dayIndex)]; $('#sessionTitle').textContent=d.focus;$('#sessionDuration').textContent=d.mins; $('#startWorkout').textContent=`START ${d.label}`; workoutIndex=0; });
  $('#startWorkout').onclick=()=>{ const active=$('.week-day.active'); const idx=active?Number(active.dataset.dayIndex):0; state.plan.exercises=week[idx].exercises.map(e=>[e.name,e.sets,e.target]); startWorkout(); };
}
function renderNutrition(p,c){
  $('#nutritionMeta').textContent=`${(p.goal||'maintenance').replaceAll('_',' ').toUpperCase()} • 7-day plan built from your selected foods.`;
  $('#calTarget').textContent=c.calories||'—';
  const metrics=[['CALORIES',`${c.calories||'—'} KCAL`],['PROTEIN',`${c.protein||'—'} G`],['WATER',`${p.water||2} L`],['MEALS',`${p.mealCount||4} / DAY`]];
  $('#nutritionMetrics').innerHTML=metrics.map(x=>`<div class="metric"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
  $('#weeklyDietPlan').innerHTML=(state.plan.dietWeek||[]).map(d=>`<div class="diet-day ${d.cheat?'cheat-day':''}"><div class="diet-day-head"><span>${d.day}</span><b>${d.cheat?'CHEAT / FLEX MEAL':'FOLLOW THE PLAN'}</b></div><div class="diet-meals">${d.items.map(x=>`<div>${x}</div>`).join('')}</div></div>`).join('');
}

function renderProgress(p,c){
  const pr=state.progress||[];
  $("#progressMetrics").innerHTML=[["START",`${p.weight||"—"} KG`,"Baseline"],["LATEST",`${pr.at(-1)?.weight||p.weight||"—"} KG`,"Latest logged"],["CHANGE",pr.length>1?`${(pr.at(-1).weight-pr[0].weight).toFixed(1)} KG`:"0.0 KG","Since first log"],["SESSIONS",`${state.checkins.length}`,"Check-ins"]].map(m=>`<div class="metric"><span>${m[0]}</span><b>${m[1]}</b><small>${m[2]}</small></div>`).join("");
  $("#measurements").innerHTML=[["WAIST","—"],["CHEST","—"],["ARMS","—"],["THIGHS","—"]].map(x=>`<div class="measure"><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
  const fitness=[["PUSH",p.pushups||0,30],["PULL",p.pullups||0,10],["SQUAT",p.squats||0,50],["PLANK",p.plank||0,120]];
  $("#scoreboard").innerHTML=fitness.map(x=>`<div class="score-row"><span>${x[0]}</span><div class="score-bar"><i style="width:${Math.min(100,x[1]/x[2]*100)}%"></i></div><b>${x[1]}</b></div>`).join("");
}
function renderCheckin(){ $$(".slider-block input").forEach(i=>i.oninput=()=>$("#"+i.name+"Out").textContent=i.value) }
function renderCoach(p,c){
  const tips=[["ENERGY TARGET",`${c.calories||"—"} kcal estimated target.`],["PROTEIN",`${c.protein||"—"}g/day target.`],["ACTIVITY",`${(c.stepTarget||0).toLocaleString()} steps/day.`],["ADAPTATION","Weekly averages matter more than one day's scale weight."]];
  $("#coachSignals").innerHTML=tips.map(x=>`<div class="coach-sign"><b>${x[0]}</b><span>${x[1]}</span></div>`).join("");
  $("#coachOpening").textContent=`Based on your ${p.level||"beginner"} level, ${p.goal||"maintenance"} goal and ${p.days||3}-day schedule, your current plan is designed for consistency first.`;
}
function renderResearch(){
  const items=[
    ["ENERGY","Mifflin–St Jeor","A validated predictive equation can estimate resting energy expenditure. It is an estimate, not a perfect measurement."],
    ["TRAINING","Progressive resistance","Training difficulty can progress through reps, sets, resistance, technique, range of motion or harder variations."],
    ["ACTIVITY","Physical activity","Daily movement targets should be personalized from the user's baseline rather than forcing everyone to the same step count."],
    ["NUTRITION","Protein","Protein targets should be contextualized to the person's goal, body size, training and overall diet."],
    ["WEIGHT","Trend analysis","Weekly averages help reduce the noise caused by normal day-to-day weight fluctuations."],
    ["SAFETY","Evidence levels","Important recommendations should distinguish strong, moderate and limited evidence and avoid overclaiming uncertain findings."]
  ];
  $("#evidenceGrid").innerHTML=items.map(x=>`<div class="card evidence"><span class="tag">${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></div>`).join("");
}
function renderProfile(p,c){
  $("#profileAvatar").textContent=initials(state.user);$("#profileName").textContent=(state.user||"Athlete").toUpperCase();$("#profileUsername").textContent="@"+state.user;
  const rows=[["GOAL",(p.goal||"maintenance").replaceAll("_"," ")],["HEIGHT",`${p.height||"—"} cm`],["WEIGHT",`${p.weight||"—"} kg`],["TRAINING",`${p.level||"—"} / ${p.days||3} days`],["LOCATION",p.location||"—"],["CALORIES",`${c.calories||"—"} kcal`]];
  $("#profileStats").innerHTML=rows.map(x=>`<div class="profile-stat"><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
}
function drawChart(id,target=false){
  const cv=$("#"+id);if(!cv)return;const rect=cv.getBoundingClientRect();const d=devicePixelRatio||1;const w=Math.max(300,rect.width),h=rect.height||300;cv.width=w*d;cv.height=h*d;const ctx=cv.getContext("2d");ctx.scale(d,d);
  ctx.clearRect(0,0,w,h);ctx.strokeStyle="#202824";ctx.lineWidth=1;
  for(let y=30;y<h;y+=55){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  let vals=(state.progress||[]).map(x=>Number(x.weight)).filter(Boolean);if(!vals.length)vals=[Number(state.profile?.weight)||70,Number(state.profile?.weight||70)-.4,Number(state.profile?.weight||70)-.2,Number(state.profile?.weight||70)-.6];
  const min=Math.min(...vals)-1,max=Math.max(...vals)+1;
  if(target){ctx.setLineDash([5,6]);ctx.strokeStyle="#6e7872";ctx.beginPath();vals.forEach((v,i)=>{const x=20+i/(vals.length-1||1)*(w-40),y=h-30-((max-v)/(max-min))*(h-70);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.setLineDash([])}
  ctx.strokeStyle=id==="weightChart"?"#c9ff32":"#c9ff32";ctx.lineWidth=3;ctx.beginPath();
  vals.forEach((v,i)=>{const x=20+i/(vals.length-1||1)*(w-40),y=h-30-((max-v)/(max-min))*(h-70);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
  vals.forEach((v,i)=>{const x=20+i/(vals.length-1||1)*(w-40),y=h-30-((max-v)/(max-min))*(h-70);ctx.fillStyle="#c9ff32";ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill()});
}
function logProgress(){
  const weight=prompt("Current weight (kg)",state.profile.weight);if(weight===null)return;
  const steps=prompt("Average daily steps",state.profile.steps||5000);
  state.progress.push({date:new Date().toISOString().slice(0,10),weight:Number(weight),steps:Number(steps||0)});save();renderAll();toast("Progress logged.");page("progress");
}
function addFood(e){e.preventDefault();const d=Object.fromEntries(new FormData(e.target));state.meals.push(d);save();renderNutrition(state.profile,calc(state.profile));e.target.reset();toast("Food added to today's log.")}
function submitCheckin(e){e.preventDefault();const d=Object.fromEntries(new FormData(e.target));state.checkins.push({...d,date:new Date().toISOString().slice(0,10)});if(d.weight)state.profile.weight=Number(d.weight);save();renderAll();toast("Check-in saved. Your next plan can adapt from this data.");page("coach")}
async function coachReply(message){
  const chat=$("#chatMessages");
  const submit=$("#chatForm button[type='submit']")||$("#chatForm button");
  const input=$("#chatForm input[name='message']");
  const userMessage=String(message||"").trim();
  if(!userMessage)return;

  const userBubble=document.createElement("div");
  userBubble.className="user-message";
  userBubble.textContent=userMessage;
  chat.appendChild(userBubble);

  const botBubble=document.createElement("div");
  botBubble.className="bot-message";
  const heading=document.createElement("b");
  heading.textContent="FITFLOW COACH";
  const body=document.createElement("div");
  body.textContent="Thinking through your question...";
  botBubble.appendChild(heading);
  botBubble.appendChild(document.createElement("br"));
  botBubble.appendChild(body);
  chat.appendChild(botBubble);
  chat.scrollTop=chat.scrollHeight;

  if(submit)submit.disabled=true;
  if(input)input.disabled=true;

  try{
    const p=state.profile||{};
    const c=calc(p);
    // Send only relevant fitness data; never send the local password or account record.
    const fitnessData={
      profile:p,
      estimates:c,
      workoutPlan:state.plan||null,
      progress:Array.isArray(state.progress)?state.progress.slice(-30):[],
      meals:Array.isArray(state.meals)?state.meals.slice(-30):[],
      checkins:Array.isArray(state.checkins)?state.checkins.slice(-30):[]
    };
    const response=await fetch("/api/coach",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        message:userMessage,
        fitnessData,
        history:coachHistory.slice(-10)
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"AI request failed");
    const reply=String(data.reply||"I couldn't generate a response. Please try again.");
    body.textContent=reply;
    coachHistory.push({role:"user",text:userMessage},{role:"model",text:reply});
    coachHistory=coachHistory.slice(-12);
  }catch(error){
    body.textContent=error.message==="Failed to fetch"
      ?"Couldn't reach the AI Coach. Make sure FitFlow is running from the Node.js server, not by opening index.html directly."
      :(error.message||"The AI Coach is temporarily unavailable.");
    console.error("FitFlow AI Coach:",error);
  }finally{
    if(submit)submit.disabled=false;
    if(input)input.disabled=false;
    if(input)input.focus();
    chat.scrollTop=chat.scrollHeight;
  }
}

function startWorkout(){
  $("#workoutModal").classList.remove("hidden");workoutIndex=0;workoutSeconds=0;updateWorkoutModal();clearInterval(workoutTimer);workoutTimer=setInterval(()=>{workoutSeconds++;const m=String(Math.floor(workoutSeconds/60)).padStart(2,"0"),s=String(workoutSeconds%60).padStart(2,"0");$("#timer").textContent=`${m}:${s}`},1000);
}
function updateWorkoutModal(){const e=state.plan.exercises[workoutIndex];$("#modalExercise").textContent=e?e[0]:"SESSION COMPLETE";$("#modalHint").textContent=e?`${e[1]} • ${e[2]} • breathe, brace and control.`:"Nice work. Log the session in your progress.";$("#nextEx").textContent=workoutIndex<state.plan.exercises.length-1?"NEXT EXERCISE →":"FINISH SESSION ✓"}
function closeWorkout(){clearInterval(workoutTimer);$("#workoutModal").classList.add("hidden")}
function setup(){
  seedAdmin();
  bindAuth();
  $$(".wizard-tab").forEach(b=>b.onclick=()=>{wizardTab=b.dataset.wizard;renderOnboarding()});
  $$(".choice").forEach(b=>b.onclick=()=>{setWizardField(b.dataset.field,b.dataset.value);setTimeout(nextWizard,180)});
  $$(".next-manual").forEach(b=>b.onclick=nextWizard);
  $("#onNext").onclick=nextWizard;$("#onBack").onclick=prevWizard;wireSliders();
  $$(".nav").forEach(n=>n.onclick=()=>{if(n.dataset.page)page(n.dataset.page)});
  $$("[data-goto]").forEach(x=>x.onclick=()=>page(x.dataset.goto));
  $("#logoutBtn").onclick=()=>{state.loggedIn=false;save();showScreen("authScreen");toast("Logged out.")};
  $("#checkinForm").onsubmit=submitCheckin;$("#logProgress").onclick=logProgress;
  $("#startWorkout").onclick=startWorkout;$("#closeWorkout").onclick=closeWorkout;
  $("#nextEx").onclick=()=>{if(workoutIndex<state.plan.exercises.length-1){workoutIndex++;updateWorkoutModal()}else{closeWorkout();toast("Session complete. Great work.")}};
  $("#prevEx").onclick=()=>{workoutIndex=Math.max(0,workoutIndex-1);updateWorkoutModal()};
  $("#chatForm").onsubmit=e=>{e.preventDefault();const d=new FormData(e.target),m=String(d.get("message")||"").trim();if(m){e.target.reset();coachReply(m)}};
  $("#mobileMenu").onclick=()=>$(".sidebar").classList.toggle("open");
  $("#themeBtn").onclick=()=>{document.body.classList.toggle("light");toast("Theme toggle is ready for customization.")};
  $("#editProfile").onclick=()=>toast("Profile editing can be connected to the onboarding form.");

  // Admin controls
  $$("#adminApp .nav").forEach(n=>n.onclick=()=>{if(n.dataset.adminPage)adminPage(n.dataset.adminPage)});
  $$("[data-admin-goto]").forEach(x=>x.onclick=()=>adminPage(x.dataset.adminGoto));
  $("#adminLogoutBtn").onclick=adminLogout;
  $("#adminThemeBtn").onclick=()=>{document.body.classList.toggle("light");toast("Theme toggle is ready for customization.")};
  $("#adminUserSearch").oninput=renderAdminUsers;$("#adminStatusFilter").onchange=renderAdminUsers;
  $("#closeAdminUser").onclick=()=>$("#adminUserModal").classList.add("hidden");
  $("#adminUserModal").onclick=e=>{if(e.target.id==="adminUserModal")e.currentTarget.classList.add("hidden")};
  $("#adminMobileMenu").onclick=()=>$("#adminApp .sidebar").classList.toggle("open");

  window.addEventListener("resize",()=>{drawChart("weightChart");drawChart("progressChart",true);drawAdminChart()});
}

setup();
if(localStorage.getItem("FITFLOW_ADMIN_SESSION"))openAdminApp();
else if(state?.loggedIn && state?.profile)openApp();else showScreen("authScreen");