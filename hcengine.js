/* DFW Roofing Pro — hard cost engine shared by hardcost.html (Hard Cost tool) and cashbid.html (Cash Bids).
   Rate cards, ABC price book, crews, subs, pay plan and compute(pb, job). Classic script: everything here is global. */
/* ===================== HELPERS ===================== */
const n = x => { const v = parseFloat(x); return isFinite(v) ? v : 0; };
const money = (v, d=2) => (v<0?'−':'') + '$' + Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:d, maximumFractionDigits:d});
const abcItem = k => ABC_CORE.find(i=>i.k===k);

/* ===================== ABC SUPPLY — what you actually paid, by SKU ===================== */
/* hist keys: mar = March 2026 COD tickets · jul = July 28 2026 rebills (contract) · aug = order ack 2012829235 (PO 8296, 8/3/26) · sep = order ack 2013897631 (PO 8412, 9/1/26). sheet = customer price list 4/13/26 (Shop acct). cur = price used by the calculator. */
const ABC_CORE = [
  {k:'sh_cambridge', sku:'02IKCA3A', desc:'IKO Cambridge AR (architectural) — 3 bdl/sq', uom:'SQ', hist:{dec25:92, jul:99, aug:95, sep:95}, sheet:99, cur:95, cls:'arch'},
  {k:'sh_3tab', sku:'01IKAM25', desc:'IKO Marathon 25-yr 3-tab (cut for caps) — 3 bdl/sq', uom:'SQ', hist:{mar:90, aug:97, sep:97}, sheet:97, cur:97, cls:'3tab'},
  {k:'cap_hr', sku:'04IKHA12', desc:'IKO Hip & Ridge 12" — 33 LF/bdl', uom:'BD', hist:{mar:65, jul:74}, sheet:92, cur:74, cov:33},
  {k:'starter', sku:'04GAPST', desc:'GAF Pro-Start starter — 120.33 LF/bdl', uom:'BD', hist:{jul:42, aug:40, sep:40}, sheet:42, cur:40, cov:120},
  {k:'ul_syn', sku:'05ABCPG20', desc:'ABC Pro Guard 20 synthetic — 10 sq/roll', uom:'RL', hist:{mar:57, jul:65, aug:62.5, sep:62.5}, sheet:65, cur:62.5, cov:10},
  {k:'iws', sku:'11IWRRGU2', desc:'Rhinoroof granulated self-adhered ice & water — 2 sq/roll', uom:'RL', hist:{jul:73.5, aug:67.5, sep:67.5}, sheet:73.5, cur:67.5, cov:60},
  {k:'drip', sku:'GDEW3015', desc:'Galv drip edge 1-1/2" woodgrain — 10\' stick', uom:'PC', hist:{mar:3.64, jul:5.25, aug:4.5, sep:4.5}, sheet:5.25, cur:4.5},
  {k:'nails', sku:'0150080011', desc:'Coil nails 1-1/4" EG — box', uom:'BX', hist:{mar:34, jul:45, aug:41.75, sep:40}, sheet:45, cur:40, cov:20},
  {k:'capnails', sku:'0150080102', desc:'Plastic cap nails 1" — 2M box', uom:'BX', hist:{mar:15, jul:19.75, aug:16.75, sep:16.75}, sheet:19.75, cur:16.75, cov:20},
  {k:'boot', sku:'141P81711', desc:'IPS 4N1 galv pipe flashing', uom:'PC', hist:{jul:9.25, aug:7.75, sep:7.75}, sheet:null, cur:7.75},
  {k:'boxvent', sku:'17AVRVG55', desc:'Air Vent RVG-55 slant-back (750) galv', uom:'PC', hist:{jul:23, aug:23, sep:23}, sheet:null, cur:23},
  {k:'versacap', sku:'17MIAVC35', desc:'Versa cap 3"–5" (gas B vent)', uom:'PC', hist:{mar:21, jul:27, aug:24.5}, sheet:27, cur:24.5},
  {k:'turbine', sku:'17LOBE12', desc:'Lomanco BEB-12 12" whirlybird turbine', uom:'PC', hist:{mar:63, jul:73}, sheet:69, cur:73},
  {k:'venturi', sku:'17AVVPN', desc:'Airvent Venturi Vent Plus w/nails', uom:'PC', hist:{sep:13}, sheet:13.5, cur:13},
  {k:'caulk', sku:'30MINP196', desc:'MasterSeal NP1 sealant 300 ml', uom:'TB', hist:{mar:5.75, jul:6.75, aug:6.5, sep:6.5}, sheet:null, cur:6.5},
  {k:'paint', sku:'200663243', desc:'Rust-Oleum accessory paint 12 oz', uom:'CN', hist:{mar:5.75, jul:6.75, aug:6.25, sep:6.25}, sheet:6.75, cur:6.25},
  {k:'delivery', sku:'DELIVERYBR', desc:'Delivery — DFW jobs (Tyler-local ran $50 on 9/1)', uom:'EA', hist:{mar:75, aug:85, sep:50}, sheet:130, cur:85},
  {k:'skylight', sku:'91BVC242BC', desc:'Birdview CM 24x24 curb-mount skylight', uom:'EA', hist:{sep:182.7}, sheet:null, cur:182.7},
  {k:'vx25', sku:'17MIVIS', desc:'Ventamatic VX25 15" galv vent', uom:'PC', hist:{mar:41.6}, sheet:null, cur:41.6},
  {k:'sla', sku:'17AVSBA', desc:'Air Vent SLA aluminum slant-back', uom:'PC', hist:{mar:13}, sheet:20, cur:13},
  {k:'broan', sku:'72671500060', desc:'Broan #636 4" roof cap w/damper', uom:'PC', hist:{mar:32.95}, sheet:null, cur:32.95},
  {k:'bdvent', sku:'17AVBDVENT', desc:'Airvent bath/dryer roof vent', uom:'PC', hist:{mar:18.86}, sheet:null, cur:18.86},
  {k:'cap_tamko', sku:'04TKAHR', desc:'Tamko AR hip & ridge — 33.3 LF/bdl', uom:'BD', hist:{mar:85}, sheet:86.71, cur:85, cov:33},
  {k:'sh_ctflex', sku:'03CTLCF3', desc:'CT Landmark ClimateFlex IR AR (Class 4)', uom:'SQ', hist:{jul:150}, sheet:157.38, cur:150, cls:'ir'},
  {k:'cap_ctflex', sku:'04CTSHCF', desc:'CT Shadow Ridge ClimateFlex H&R 12" — 30 LF/bdl', uom:'BD', hist:{jul:85}, sheet:123.18, cur:85, cov:30},
  {k:'lumber2x4', sku:'312NS', desc:'SYP #2 2x4x10 lumber', uom:'EA', hist:{mar:8.84}, sheet:null, cur:8.84},
];
/* Other shingles & accessories you might spec — April 13 2026 price list (Shop acct). Contract has run 5–8% under list. */
const ABC_SHINGLE_LIST = [
  ['sh_dynasty','02IKDYARDS','IKO Dynasty AR',110,'arch'],['sh_nordic','02IKNDCDS','IKO Nordic (Class 4)',145,'ir'],['sh_hdz','02GASTZ3WW','GAF Timberline HDZ',134.59,'arch'],['sh_armorshield','03GAAS2WW','GAF Armorshield II (Class 4)',145,'ir'],
  ['sh_duration','02OCTDUDW','OC TruDef Duration',132.51,'arch'],['sh_durstorm','02OCTSTDW','OC TruDef Duration Storm (Class 4)',149,'ir'],['sh_heritage','02TKFH2WW','Tamko Heritage',103,'arch'],['sh_titan','02TKTXTWW','Tamko Titan XT',125.83,'arch'],
  ['sh_stormfighter','02TKSFF4WW','Tamko StormFighter Flex (Class 4)',157.38,'ir'],['sh_landmark','02CTLA30WW','CertainTeed Landmark',131.95,'arch'],['sh_vista','02MLVIA3WW','Malarkey Vista AR (Class 4)',143.38,'ir'],['sh_royalestate','03IKRE3HV','IKO Royal Estate (designer)',238.44,'designer']
];
const SHEET = [["04IKLEP118","Leading Edge Starter 118LF",null,"BD"],["01MLDA25WW","Mal Duraseal",null,"SQ"],["01TKFRELWW","TAMKO AR Elite",102.0,"SQ"],["02MLHLXAWW","Mal Highlander",132.02,"SQ"],["02TKFH2WW","Tamko Heritage",103.0,"SQ"],["04MLEZXTWW","Mal EZ Ridge XT",138.51,"BD"],["04TK10SS","10\" Starter Shingle 100LF/BD",72.29,"BD"],["04TKAHRWW","TAMKO AR H&R (33.3LF)",86.71,"BD"],["01CTA25WW","CT AR XT25",113.4,"SQ"],["02CTLA30WW","CT Landmark",131.95,"SQ"],["01GAERYWY","GAF Royal Sovereign",123.72,"SQ"],["02CTPAAW","Cert Patriot",122.45,"SQ"],["02GASTNSWW","GAF Timb Natural Shadow",119.38,"SQ"],["03CTLP3WWM","CT Landmark Pro AR",152.73,"SQ"],["02GASTZ3WW","GAF Timberline HDZ",134.59,"SQ"],["03CTBMBG","CT Belmont AR",null,"SQ"],["02GASTZ3HC","GAF Timb HDZ Harvest",134.59,"SQ"],["03CLFPTLWW","Cert AR President TL",null,"SQ"],["03GATUHZWW","GAF Timb Ultra HDZ",146.51,"SQ"],["04CTSWST","Cert SwiftStart Starter 116'4\"",73.8,"BD"],["04GAZRWW","GAF Z-Ridge (33LF)",97.24,"BD"],["04CTCCWW","CT Cedar Crest H&R",106.66,"BD"],["04GASR2CH","GAF Seal-A-Ridge (25LF)",83.11,"BD"],["04GAPST","GAF Pro-Start Starter 120.33LF",42.0,"BD"],["04CTHRSWW","CT Shangle Ridge (10LF)",105.5,"BD"],["04CTPRSTWW","CERT Pres Starter 36LF",130.5,"BD"],["04GATXCH","Timbertex 20LF",95.91,"BD"],["04CT10SHP","CERT 10\" Starter High Perform 102LF",154.13,"BD"],["04GAWBL100","Weatherblocker (100LF)",119.38,"BD"],["04GASCSWW","GAF Startermatch (60LF)",141.95,"BD"],["01OCSUDW","OC Supreme",112.87,"SQ"],["02TKTXTWW","Tamko Titan XT",125.83,"SQ"],["02OCO25ADW","OC Oakridge",122.68,"SQ"],["02TKSFF4WW","Tamko StormFighter FLEX (Class 4)",157.38,"SQ"],["02OCTDOADW","OC TruDef Oakridge",127.65,"SQ"],["04TKHIHRWW","TAMKO Heritage IR H&R 33.3LF",null,"BD"],["02OCTDUDW","OC TruDef Duration",132.51,"SQ"],["03CTLCF3MB","CT Landmark ClimateFlex IR AR",157.38,"SQ"],["04OCSSS","OC Starter Strip Shingle (105LF)",69.46,"BD"],["03CTBMIRWW","CT Belmont IR AR",246.3,"SQ"],["04OCAPEDW","OC Proedge AR 33LF",103.7,"BD"],["03CTPRIRWW","CT President IR AR",287.09,"SQ"],["04OCARZDW","OC Rizeridge AR 33LF",115.35,"BD"],["04CTCIWW","CT Cedar Crest IR H&R",106.66,"BD"],["04OCADRDW","OC Duraridge (20LF)",null,"BD"],["04CTSHCFWW","CT Shadow Ridge ClimateFlex AR H&R 12\"",123.18,"BD"],["02OCTSTDW","OC TruDef Duration Storm (IR)",149.0,"SQ"],["02OCTDFADW","OC TruDef Dura Flex AR",null,"SQ"],["01ATGM25WW","Atlas Glassmaster",116.97,"SQ"],["04OCIRARDW","OC ImpactRidge AR",139.4,"BD"],["02ATP42PWW","Atlas Pinnacle Pristine w/SG HP42",124.33,"SQ"],["02ATPIWW","Atlas Pinnacle Impact SG",141.08,"SQ"],["02ATPL42WW","Atlas Prolam",116.39,"SQ"],["02MLVIA3WW","Malarkey Vista AR (Class 4)",143.38,"SQ"],["04ATSSHP42","Atlas Pro-Cut Starter 140LF",81.66,"BD"],["03MLLAWW","Malarkey Legacy",162.78,"SQ"],["04ATPCHPWW","Atlas Pro-Cut HI Profile H&R 20LF",119.12,"BD"],["03GAAS2WW","GAF Armorshield II (Class 4)",145.0,"SQ"],["03GASIGSWW","GAF SG Grand Sequoia ArmorShield",318.88,"SQ"],["04GASRAWW","GAF SG Seal-A-Ridge ArmorShield 25LF",109.0,"BD"],["01IKAM25WW","IKO Marathon 25YR (3-tab)",97.0,"SQ"],["02IKDYARDS","IKO Dynasty AR",110.0,"SQ"],["02IKCA3AWW","IKO Cambridge AR",99.0,"SQ"],["02IKNDCDS","IKO Nordic (Class 4)",145.0,"SQ"],["03IKRE3HV","IKO Royal Estate",238.44,"SQ"],["03IKASAWS","IKO AR Armourshake",null,"SQ"],["04IKHA26DW","IKO AR Hip & Ridge 12",92.0,"BD"],["04IKUHPWW","IKO Ultra HP 20LF",null,"BD"],["17MIAVC79","Versa Cap 7\" to 9\"",83.0,"PC"],["0150080102","Nail ABC Plastic Cap 1\" 2M/BX",19.75,"BX"],["17LO550ML","550/RVG 51 Low Profile Vent Mill & Painted",24.0,"PC"],["0150080122","Nail ABC Plastic Cap 1\" 3M/Pail",25.0,"PA"],["17AVSBAWW","750/SLA Slant Back Vent Mill & Painted",20.0,"PC"],["0150080011","Coil Nail ABC 1-1/4\" EG",45.0,"BX"],["17LO135BK","Lomanco 135 Static Vent",79.0,"PC"],["0150080022","Nail 1-1/4\" EG Roof 50#/BX",99.99,"BX"],["17AVB144BK","Airvent Galv Vent B144",62.72,"PC"],["50PSPLCL76","Deck Clips 250/BX",32.99,"BX"],["17LO2000BZ","Lomanco 2000 Power Vent",195.0,"EA"],["0150080071","8D Sinker 50#/Box",143.13,"BX"],["17SLBE12ML","Airvent 12\" Turbine Mill & Painted",69.0,"PC"],["17LOBE12BR","Lomanco 12\" Turbine (BEB-12) Mill & Painted",69.0,"PC"],["05MI486915","15# Felt ASTM 4869 4SQ/RL",null,"RL"],["17LOBE14BK","Lomanco 14\" Turbine Mill & Painted",72.0,"PC"],["11TRICECR2","Tarco Ice & Water MS300 2SQ",98.99,"RL"],["17GARC3","GAF Cobra Rigid Vent 3 12\" (4')",20.75,"PC"],["05MIMRMFNC","Max Roof MaxFelt 10SQ w/Nails",85.99,"RL"],["17OCVS4N","OC Ventsure 12\"x4' Strip",23.5,"PC"],["05ABCPG20","ABC Pro Guard 20 Synthetic 10SQ w/Nails",65.0,"RL"],["9106932363","Leakbarrier UDL15 10SQ",98.99,"RL"],["17ATTRWN4","Atlas TruRidge 4' w/Nail",20.75,"PC"],["11IWRRGU2","Rhinoroof Granulated Self-Adhered 2SQ/RL",73.5,"RL"],["17AVVPN","Airvent Venturi Vent Plus w/Nails",13.5,"PC"],["11ATSUM60","Atlas Summit 60 10SQ",123.99,"RL"],["17KESFR36Z","Kennedy Solar Attic Fan 36W",null,"PC"],["11ATSUM10","Atlas Summit 180 10SQ",null,"RL"],["11ATWMI200","Atlas Weathermaster 200",141.99,"RL"],["05CTSRR10","CertainTeed RoofRunner Syn 10SQ",140.99,"RL"],["GDEW3015BK","Galv Drip Edge 1-1/2\" x 1-1/2\" 10' (1x2)",5.25,"PC"],["05GAFBSR10","GAF FeltBuster 10SQ",147.99,"RL"],["11GASG2","GAF StormGuard 2SQ/RL",148.99,"RL"],["MGEV11232","1-1/2 x 1-1/2 Drip Edge Painted",null,"PC"],["11GATP10","GAF TigerPaw 10SQ",304.99,"RL"],["GDEW3022BR","2x2 \"True Size\" Drip Edge Painted",9.0,"PC"],["11IKSS","IKO StormShield Ice & Water",149.99,"RL"],["11OCPROA10","OC ProArmor Syn 10SQ",146.99,"RL"],["MGBF94428","4\"x4\"x10' Galv Base Flashing",25.25,"PC"],["11OCDDEF10","OC Deck Defense 10SQ",282.99,"RL"],["MGSS448","Step Shingle Flashing 4x4x8\" 100/BD",78.5,"BD"],["11OCWLM2","OC WeatherLock 2SQ",163.99,"RL"],["MGRV205032","Galv Roll Valley 20\"x50'",180.5,"RL"],["05MLSYUN10","Malarkey Secure Start Syn 10SQ",null,"RL"],["MGRV245030","Galv Roll Valley 24\"x50'",null,"RL"],["GWV2624BK","Galv W Valley 26GA 24\"",null,"PC"],["14MILF152","1-1/2\" Lead Flashing 2.5#",19.99,"PC"],["0170030005","Spray Paint",6.75,"CN"],["14MILF202T","2\" Lead Flashing 2.5# Tallcone",21.99,"PC"],["30MHJTS1CL","MH JTS1 Joint/Term Sealant 10oz Clear",8.64,"TB"],["14MILF302T","3\" Lead Flashing 2.5# Tallcone",28.94,"PC"],["30MHJTS1BK","MH JTS1 Joint/Term Sealant 10oz Black",6.57,"TB"],["17DMBB15BK","1-1/2\" Bullet Boot",28.69,"PC"],["04RR10WW","Rapid Ridge 10\" 20LN",110.0,"BD"],["17DMBB2BK","2\" Bullet Boot",40.99,"PC"],["06MHSASWW","MH SA-SBS Cap Sheet 1SQ/RL",131.07,"RL"],["17DMBB3BK","3\" Bullet Boot",35.99,"PC"],["DM6RJAPWW","6\" Roof Jack w/Adj Pitch",null,"PC"],["06MHSAB","MH SA Base Sheet 2SQ/RL",140.36,"RL"],["17DMRJ8GV","8\" Roof Jack w/Adj Pitch",51.99,"PC"],["06MHSANB","MH Nail Base 2SQ/RL",141.43,"RL"],["MGGGM630","6\" Gravel Guard",18.5,"PC"],["MGCFS626","6\" Counter Flashing Saw Joint 10'",27.0,"PC"],["17MIAVC35","Versa Cap 3\" to 5\"",27.0,"PC"],["17MIAVC57","Versa Cap 5\" to 7\"",35.0,"PC"]];
const CITIES = {'Allen':150,'Anna':160,'Arlington':334,'Bedford':77,'Coppell':100,'Dallas':199,'DeSoto':114,'Farmers Branch':153,'Fate':100,'Frisco':153,'Garland':88,'Grand Prairie':50,'Grapevine':42,'Gunter':200,'Hurst':60,'Krugerville':100,'Lancaster':100,'McKinney':200,'Melissa':92,'Mesquite':65,'Midlothian':51,'Pantego':258,'Plano':75,'Princeton':90,'Prosper':100,'Rockwall':129,'Rowlett':62,'Royse City':100,'Sachse':175,'Seagoville':100,'Sunnyvale':103,'The Colony':75,'Tyler':150,'Waxahachie':75,'Weatherford':125,'Weston':75,'White Settlement':319,'Wylie':50}; /* permit medians from Lynx paid-outs, Oct 6 2026 */

/* ===================== SUBS — rate cards exactly as invoiced ===================== */
const CREWS = {
  thr:{name:'Texas Home Repair', who:'Servando Luises · 469-401-6460 · luisesroofing@gmail.com', base:65, base_note:'tear-off to decking + install, measured squares (incl. starter & H&R conversion) · first layer of felt included', feltFirst:false, felt:5, steep1:5, steep2:5, story:0, deck:20, ridge:3, cancel:0, wood:2, trip:0, src:'INV0571 · INV0572 · INV0580 · INV0581 · INV0582 (Aug 12 – Sep 10, 2026); DFW Labor PO 8339 & 721 Poinsettia'},
  omar:{name:'Omar Alvarez', who:'214-926-1271 · oalvarez263@gmail.com', base:65, base_note:'$65/sq DFW · $80/sq Tyler-area jobs · first layer of felt included', feltFirst:false, felt:5, steep1:0, steep2:25, story:0, deck:20, ridge:0, cancel:0, wood:0, trip:0, src:'303 Chicken St (46 sq × $65, 9/3/26) · 1903 Royal Oaks, Tyler (74.66 sq × $80, 12/12 +$25/sq, 3-layer felt $10/sq, 7/30/26)'},
  will:{name:'Will Moore The Roofer', who:'903-985-9961 · Allen, TX', base:70, base_note:'squares installed · felt charged from the first layer ($5/sq)', feltFirst:true, felt:5, steep1:5, steep2:45, story:0, deck:20, ridge:1, cancel:25, wood:0, trip:25, src:'Inv 6, 8, 9, 11, 12 & change order (Aug 24 – Sep 9, 2026): ridge vent $1/lf, cancel turbines $25, trip $25, felt-only tarp job $250, decking $20 (once $60), crew-supplied materials at cost'},
  rr3:{name:'R&R3 LLC', who:'Ricardo Licea · 972-863-1041 (Zelle)', base:90, base_note:'steep roofs 9/12–11/12, all-in incl. 3-layer felt removal', feltFirst:false, felt:0, steep1:0, steep2:0, story:0, deck:20, ridge:0, cancel:0, wood:0, trip:0, src:'Inv 183 (42 sq × $90, 11/12) · Inv 184 (48 sq × $90, 9/12, 3 layers) — 7/30/26'},
};
const SUBS = [
  {g:'Solar', k:'solar_panel', label:'Solar panel detach & reset — Blue Construction (Abram Juarez)', unit:'$/panel', def:125, src:'Blake 7/29/26: "We pay $125 a panel." Abram bills $150 (inv 1085: 20 panels $3,000; inv 1090: $1,800 + $2,800 R&R). AccuLynx: 35 jobs, median $4,000'},
  {g:'Solar', k:'solar_alt', label:'Solar detach & reset — JMW Solar Repair (backup)', unit:'$/panel', def:130, src:'JMW pricing sheet 4/30/26: $130/panel · 2-story +$10/panel · critter guard $16/ft · troubleshooting $125/hr'},
  {g:'Gutters', k:'gut_lf', label:'5" seamless gutters + 2x3 downspouts — Flowers Gutters', unit:'$/lf', def:4.00, src:'Inv 3165 13919 Vida: 246 + 177 = 423 lf = $1,692 · Inv 3153 Wisterwood: 326 lf = $1,304 · Inv 3174 Vista Park: 367 lf = $1,468 (corners, offsets, valley shields count as lf)'},
  {g:'Gutters', k:'gut_guard', label:'Leaf guard — Flowers', unit:'$/lf', def:3.00, src:'Inv 3181 Willowood: $847 − 145 lf × $4 = $267 ÷ 89 lf'},
  {g:'Gutters', k:'gut_blaster', label:'Leaf Blaster micro-mesh — Flowers (derived)', unit:'$/lf', def:8.50, src:'Inv 3024 Shady Oaks: $4,830 − 478 lf × $4 − 51 lf 6" ≈ $8.50/lf'},
  {g:'Gutters', k:'gut_min', label:'Small-job minimum — Flowers', unit:'$/job', def:150, src:'Inv 3157 Badger Run: 13 lf downspout = $150 · Inv 3025 Spurcross: 35 lf = $230'},
  {g:'Screens & glass', k:'screen', label:'Window screen — Mesquite Glass & Window', unit:'$/ea', def:40, src:'AccuLynx paid-outs in $40 multiples (64 jobs, median $362)'},
  {g:'Fence & paint', k:'stain_sqft', label:'Fence wash & stain — Silva Home Solutions (Cody)', unit:'$/sqft', def:0.55, src:'Alexandria: 2,576 sqft × $0.55 = $1,416.80 (9/4/26) · flat quotes $400 (720 sqft) and $1,008 (1,680 sqft)'},
  {g:'Fence & paint', k:'stain_r3', label:'Fence clean & stain — R3 Fence Restoration (Jerry), per job', unit:'$/job', def:1409.80, src:'Inv 112: 1201 Pheasant Run $1,409.80 · 721 Poinsettia $600 (Sep 2026)'},
  {g:'Fence & paint', k:'paint_small', label:'Interior water-damage repair, small — Garcia\'s Painting', unit:'$/job', def:200, src:'Inv 1129 4169 Coral Springs $200 (9/3/26)'},
  {g:'Fence & paint', k:'paint_med', label:'Interior repair, bath + hallway — Garcia\'s', unit:'$/job', def:650, src:'Inv 1128 13629 Choctaw $650 (9/3/26) · siding repair $450 (Tanur Cascade) · AccuLynx median $750'},
  {g:'Garage', k:'garage', label:'16x7 garage door installed — Gallardo\'s Garage Doors', unit:'$/ea', def:1200, src:'Inv 000961 Willowood · Inv 000953 Moonglade · Pugh estimate. 4% card fee if paid by card — pay by check'},
  {g:'Garage', k:'garage_ins', label:'Insulation kit 16x7 — Gallardo\'s', unit:'$/ea', def:300, src:'Inv 000953 (9/10/26)'},
  {g:'Inspections & claims', k:'inspection', label:'Inspection — Summit (Ashton Norrell) / CROB / Beraru', unit:'$/ea', def:100, src:'Summit INV-000031: 14 inspections × $100, reinspection $100, trip fee $50 (Jun–Jul 26)'},
  {g:'Inspections & claims', k:'reinspect', label:'Re-inspection — Summit', unit:'$/ea', def:100, src:'INV-000031'},
  {g:'Inspections & claims', k:'supp_fee', label:'Supplement write-up — CROB (Chad Roberts) / Mike Taylor / Invictus', unit:'$/supp', def:150, src:'CROB INV-000137: 24 supplements × $150 (8/10/26) · Mike Taylor $150 × 205 in AccuLynx'},
  {g:'Inspections & claims', k:'appraisal', label:'Appraisal — Claim Experts / WM Contracting (Teresa Garza)', unit:'$/job', def:2000, src:'AccuLynx: Claim Experts $1,000–$3,000, median $2,000 (92 × $2,000)'},
  {g:'Inspections & claims', k:'measure', label:'Roofr measurement report', unit:'$/job', def:14, src:'AccuLynx: 198 × $14 (EagleView $55–81)'},
  {g:'Materials elsewhere', k:'deck_mat', label:'7/16 OSB sheet — Home Depot', unit:'$/sheet', def:14.05, src:'AccuLynx 9/4/26: 2 sheets $28.10'},
  {g:'Permits', k:'permit_default', label:'Permit when city not listed', unit:'$/job', def:150, src:'AccuLynx city paid-outs (see History for each city)'},
  {g:'Business', k:'tax', label:'Sales tax on ABC materials', unit:'%', def:8.25, src:'every ABC ack'},
  {g:'Business', k:'rebate', label:'ABC 2026 rebate accrual (retro to $1)', unit:'%', def:4, src:'Dakota 12/12/25: 4% at $1M+, 6% at $3.5M+ (excludes low-slope & new-con siding)'},
  {g:'Business', k:'waste_default', label:'Default shingle waste', unit:'%', def:10, src:'your PO standard'},
  {g:'Business', k:'target_net', label:'Target net margin after commission', unit:'%', def:45, src:'your history: 46% median'},
  {g:'Business', k:'fee_card', label:'Card processing fee (off commission basis)', unit:'%', def:4, src:'9/18/26 commission report: CC payments × 0.96'},
  {g:'Business', k:'fee_ach', label:'ACH fee (off commission basis)', unit:'%', def:1, src:'9/18/26 commission report: ACH payments × 0.99'},
  /* Owner-only inputs: the live values are kept in the shared price book on the server and are only sent to the owner.
     Everyone else gets 0 here, so the base-pay allocation simply does not appear for them. */
  {g:'Business', k:'sales_base_wk', label:'Weekly sales base pay (managers + reps)', unit:'$/wk', def:0, src:'owner only · kept in the shared price book', owner:true},
  {g:'Business', k:'office_base_wk', label:'Weekly office & field W-2 pay', unit:'$/wk', def:0, src:'owner only · kept in the shared price book', owner:true},
  {g:'Business', k:'payroll_tax', label:'Employer payroll taxes on W-2 pay', unit:'%', def:0, src:'owner only · kept in the shared price book', owner:true},
  {g:'Business', k:'jobs_per_wk', label:'Built jobs per week (for base-pay allocation)', unit:'jobs', def:0, src:'owner only · kept in the shared price book', owner:true},
];
/* PAY PLAN — commission rates only (what the costing engine needs). Weekly base pay, Gusto and per-person pay
   terms are NOT in this file: they live in the Master System (comp_private.plan_terms) and are owner-only. */
const PAY_PLAN_EFFECTIVE = 'week of Sep 18, 2026';
const OWNER_ONLY_PB_KEYS = ['sales_base_wk','office_base_wk','payroll_tax','jobs_per_wk'];
const REPS = {
  'Moe Awadi':      {role:'rep', rate:15, team:'none'},
  'Garrett Cook':   {role:'rep', rate:13, team:'both'},
  'Daniel Gonzalez':{role:'rep', rate:10, team:'both'},
  'Gersom Hernandez':{role:'rep', rate:10, team:'both'},
  'Isaiah Wetzel':  {role:'rep', rate:10, team:'both'},
  'Ivan Paz':       {role:'rep', rate:10, team:'both'},
  'Orion Keith':    {role:'rep', rate:10, team:'both'},
  'Shane Holcomb':  {role:'rep', rate:10, team:'both'},
  'Mike Mullens':   {role:'mgr', rate:0, team:'none'},
  'Richard Mullens':{role:'mgr', rate:0, team:'none'},
  'Kaden Morel':    {role:'mgr', rate:0, team:'none'},
  'House / no rep': {role:'house', rate:0, team:'none'}
};
const MGRS = {mike:{name:'Mike Mullens', rate:3, scope:'every payment'}, richard:{name:'Richard Mullens', rate:2, scope:'every rep except Moe'}, kaden:{name:'Kaden Morel', rate:2, scope:'every rep except Moe'}, both:{name:'Richard Mullens + Kaden Morel', rate:4, scope:'every rep except Moe'}};
const COMM = {none:{label:'No commission',rate:0},custom:{label:'Custom rep %',rate:null}};
/* AccuLynx history, Jun 2025 – Sep 2026 · p10/p25/p50/p75/p90. Company margin percentiles are owner-only and come from the server (hc_load → ownerBench). */
const BENCH = {
  matched:{n:206, sq:[24.4,29.4,33.7,40.6,49.9], matSq:[112,115,120,133,146], labSq:[61,66,76,90,124], hardSq:[191,224,254,314,363], contractSq:[364,444,543,648,829]},
  built:{n:476, contract:[11274,15903,20114,27952,36779], material:[3333,3872,4664,6004,7763], labor:[1947,2231,2728,3663,4910], matPct:[15.8,19.0,23.7,28.9,35.3], labPct:[9.1,11.4,13.7,17.3,22.6], hardPct:[34.6,39.5,48.0,57.0,68.3]},
  trades:[['Gutters (Flowers)',162,1406],['Permit',298,100],['Claim / supplement / appraisal fees',341,1150],['Inspections',87,200],['Measurement reports',222,14],["Paint & interior (Garcia's)",88,750],['Fence stain (Silva / R3)',48,914],["Garage door (Gallardo's)",45,1560],['Screens & glass (Mesquite Glass)',64,362],['Solar detach/reset (Blue Construction)',35,4000]]
};

/* ===================== PRICE BOOK (flat, editable, shared) ===================== */
const PB_DEF = {};
ABC_CORE.forEach(i => PB_DEF[i.k] = i.cur);
ABC_SHINGLE_LIST.forEach(s => PB_DEF[s[0]] = s[3]);
SHEET.forEach(s => { if (s[2]!=null) PB_DEF['sheet:'+s[0]] = s[2]; });
for (const c in CREWS){ for (const f of ['base','felt','steep1','steep2','story','deck','ridge','cancel','wood','trip']) PB_DEF[`crew:${c}:${f}`] = CREWS[c][f]; }
SUBS.forEach(s => PB_DEF[s.k] = s.def);
PB_DEF.cap_3tab_cov = 30; PB_DEF.wallflash = 3.90; PB_DEF.valleymetal = 3.61; PB_DEF.ridgevent = 20.75; PB_DEF.powervent = 195; PB_DEF.cap_ir = 139.40; PB_DEF.cap_ir_cov = 20;
const SHINGLES = [...ABC_CORE.filter(i=>i.cls).map(i=>[i.k,i.desc.split(' — ')[0].replace(' (architectural)',''),i.cls,'live']), ...ABC_SHINGLE_LIST.map(s=>[s[0],s[2],s[4],'list'])];

/* ===================== COSTING ENGINE ===================== */
function compute(pb, j){
  const sqAll = n(j.sq), wasteF = 1 + n(j.waste)/100;
  const bpFlat = (j.byPitch && typeof j.byPitch==='object') ? Object.entries(j.byPitch).filter(([p,v])=>parseFloat(p)<=2 && n(v)>0).reduce((a,[,v])=>a+n(v),0)/100 : 0;
  const sqFlat = n(j.sqFlat)>0 ? Math.min(sqAll, n(j.sqFlat)) : Math.min(sqAll, Math.round(bpFlat*100)/100);
  const sq = Math.max(0, Math.round((sqAll - sqFlat)*100)/100), sqSh = sq*wasteF;
  const L = {material:[], labor:[], trades:[], fees:[], extras:[]};
  const add = (arr, label, qty, unit, unitCost, note, sku) => { const total = qty*unitCost; if (qty>0 && isFinite(total)) arr.push({label, qty, unit, unitCost, total, note, sku}); return qty>0?total:0; };
  const sh = SHINGLES.find(s=>s[0]===j.shingle) || SHINGLES[0];
  const shPrice = n(pb[j.shingle]);
  if (sq>0) add(L.material, sh[1]+' shingles', Math.ceil(sqSh*3), 'bdl', shPrice/3, `${sq} sq + ${n(j.waste)}% = ${sqSh.toFixed(1)} sq · ${money(shPrice,2)}/sq${sh[3]==='list'?' · list price':''}`, (abcItem(j.shingle)||{}).sku);
  if (sqFlat>0){
    add(L.material, 'Mule-Hide SA base sheet (flat)', Math.ceil(sqFlat*1.1/2), 'roll', n(pb.flat_base), `${sqFlat} flat sq + 10% ÷ 2 sq/roll`, '06MHSAB');
    add(L.material, 'Mule-Hide SA-SBS cap sheet (flat)', Math.ceil(sqFlat*1.1), 'roll', n(pb.flat_cap), `${sqFlat} flat sq + 10% · 1 sq/roll`, '06MHSASWW');
  }
  const hrLf = n(j.ridges)+n(j.hips);
  if (hrLf>0){
    if (j.cap==='3tab') add(L.material, 'Hip & ridge — cut Marathon 3-tab', Math.ceil(hrLf/Math.max(1,n(pb.cap_3tab_cov))), 'bdl', n(pb.sh_3tab)/3, `${hrLf} lf ÷ ${n(pb.cap_3tab_cov)} lf/bdl`, '01IKAM25');
    else if (j.cap==='hr') add(L.material, 'IKO Hip & Ridge 12"', Math.ceil(hrLf/33), 'bdl', n(pb.cap_hr), `${hrLf} lf ÷ 33 lf/bdl`, '04IKHA12');
    else add(L.material, 'Class 4 hip & ridge (OC ImpactRidge)', Math.ceil(hrLf/Math.max(1,n(pb.cap_ir_cov))), 'bdl', n(pb.cap_ir), `${hrLf} lf ÷ ${n(pb.cap_ir_cov)} lf/bdl · list`, '04OCIRARDW');
  }
  const perim = n(j.eaves)+n(j.rakes);
  if (perim>0){
    add(L.material, 'GAF Pro-Start starter', Math.ceil(perim*1.1/120), 'bdl', n(pb.starter), `${perim} lf + 10% ÷ 120 lf/bdl`, '04GAPST');
    add(L.material, 'Drip edge 1-1/2"', Math.ceil(perim*1.1/10), 'stick', n(pb.drip), `${perim} lf + 10% ÷ 10'`, 'GDEW3015');
  }
  if (sq>0) add(L.material, 'ABC Pro Guard 20 synthetic', Math.ceil(sq/10), 'roll', n(pb.ul_syn), `${sq} sq ÷ 10 sq/roll`, '05ABCPG20');
  const iwsNeed = n(j.valleys)/60 + 0.5*(n(j.chimneys)+n(j.skylights));
  if (iwsNeed>0) add(L.material, 'Rhinoroof ice & water', Math.ceil(iwsNeed), 'roll', n(pb.iws), `${n(j.valleys)} lf valleys ÷ 60 usable lf` + ((n(j.chimneys)+n(j.skylights))>0?' + ½ roll per chimney/skylight':''), '11IWRRGU2');
  if (j.valleyMetal && n(j.valleys)>0) add(L.material, 'Galv roll valley', n(j.valleys), 'lf', n(pb.valleymetal), 'list $180.50 / 50\'', 'MGRV205032');
  if (n(j.wall)>0) add(L.material, 'Step + counter flashing', n(j.wall), 'lf', n(pb.wallflash), 'list: step 100/bdl $78.50 + 6" counter $27/10\'', 'MGSS448');
  add(L.material, 'IPS 4N1 pipe boots', n(j.boots), 'ea', n(pb.boot), '', '141P81711');
  add(L.material, 'RVG-55 slant-back box vents', n(j.boxvents), 'ea', n(pb.boxvent), '', '17AVRVG55');
  add(L.material, 'Versa caps 3"–5"', n(j.versacaps), 'ea', n(pb.versacap), '', '17MIAVC35');
  add(L.material, 'Lomanco BEB-12 turbines', n(j.turbines), 'ea', n(pb.turbine), '', '17LOBE12');
  add(L.material, 'Power vents', n(j.powervents), 'ea', n(pb.powervent), 'list', '17LO2000BZ');
  if (n(j.ridgeVent)>0) add(L.material, 'Cobra rigid ridge vent', Math.ceil(n(j.ridgeVent)/4), '4\' pc', n(pb.ridgevent), `${n(j.ridgeVent)} lf ÷ 4' · list`, '17GARC3');
  add(L.material, 'Birdview 24x24 skylight', n(j.skylights), 'ea', n(pb.skylight), '', '91BVC242BC');
  if (n(j.deckSheets)>0) add(L.material, '7/16 OSB (Home Depot)', n(j.deckSheets), 'sheet', n(pb.deck_mat), '');
  if (n(j.woodLf)>0) add(L.material, 'SYP 2x4x10 for wood repair', Math.ceil(n(j.woodLf)/10), 'ea', n(pb.lumber2x4), `${n(j.woodLf)} lf ÷ 10'`, '312NS');
  if (sq>0){
    add(L.material, 'Coil nails 1-1/4"', Math.ceil(sq/20), 'box', n(pb.nails), '1 box / 20 sq', '0150080011');
    add(L.material, 'Plastic cap nails', Math.ceil(sq/20), 'box', n(pb.capnails), '1 box / 20 sq', '0150080102');
    add(L.material, 'MasterSeal NP1', 3, 'tube', n(pb.caulk), '3 per job', '30MINP196');
    add(L.material, 'Spray paint', 2, 'can', n(pb.paint), '2 per job', '200663243');
  }
  const matSub = L.material.reduce((s,l)=>s+l.total,0); const sqTotal = sqAll;
  const hdTotal = L.material.filter(l=>!l.sku).reduce((s,l)=>s+l.total,0);   // Home Depot lines (no ABC sku) — taxed too
  const tax = matSub * n(pb.tax)/100;
  const delivery = sq>0 ? n(pb.delivery) : 0;
  let materials = matSub + tax + delivery;
  if (n(j.matKnown)>0){ L.material = [{label:'ABC material — actual invoice from Lynx', qty:1, unit:'job', unitCost:n(j.matKnown), total:n(j.matKnown), note:'exact amount paid · replaces the estimated material list'}]; materials = n(j.matKnown); }
  const rebate = (matSub - hdTotal) * n(pb.rebate)/100;

  // Labor — selected crew's rate card
  const c = j.crew==='custom' ? 'thr' : j.crew;
  const R = f => n(pb[`crew:${c}:${f}`]);
  const crewName = CREWS[c]?.name || 'Crew';
  let base = R('base'); let baseNote = 'measured squares';
  if (c==='omar' && j.tyler){ base = 80; baseNote = 'Tyler-area rate'; }
  add(L.labor, `${crewName} — tear-off + install (shingle)`, sq, 'sq', base, baseNote + (sqFlat>0?` · ${sqAll} total − ${sqFlat} flat`:''));
  if (sqFlat>0) add(L.labor, `${crewName} — flat roof, 2-ply self-adhered`, sqFlat, 'sq', R('flat')>0 ? R('flat') : n(pb.flat_labor), R('flat')>0 ? 'crew flat rate' : 'flat-roof sub rate (Top Repair Roofing)');
  const feltLayers = CREWS[c]?.feltFirst ? n(j.layers) : n(j.layers)-1;   /* THR & Omar: first layer included · Will: $5/sq from the first layer (Blake 9/20/26) */
  if (feltLayers>0 && R('felt')>0) add(L.labor, CREWS[c]?.feltFirst ? `Felt / shingle layers (${n(j.layers)}, charged from the first)` : `Extra felt / shingle layers (${n(j.layers)-1}, first included)`, sqAll*feltLayers, 'sq', R('felt'));
  const stepRate = R('pitchStep');
  const stepAdd = rise => stepRate>0 ? Math.max(0, Math.round(rise)-7)*stepRate : (rise>=12 ? R('steep2') : rise>=8 ? R('steep1') : 0);
  const riseCls = r => r>=12 ? 'steep2' : r>=8 ? 'steep1' : 'low';
  const bpE = j.byPitch && typeof j.byPitch==='object' ? Object.entries(j.byPitch).filter(([p,v])=>n(v)>0 && parseFloat(p)<=24) : [];
  const bpMax = bpE.reduce((m,[p,v])=> n(v)>m.v ? {p:parseFloat(p),v:n(v)} : m, {p:0,v:0}).p;
  if (bpE.length && sq>0 && riseCls(bpMax)===j.pitch){
    const tot = bpE.reduce((a,[,v])=>a+n(v),0)||1;
    bpE.filter(([p])=>parseFloat(p)>=8).sort((a,b)=>parseFloat(a[0])-parseFloat(b[0])).forEach(([p,v])=>{ const s_=n(v)/tot*sqSh; const ad=stepAdd(parseFloat(p)); if (s_>0&&ad>0) add(L.labor, `Pitch adder ${parseFloat(p)}/12`, Math.round(s_*100)/100, 'sq', ad, 'Roofr pitch breakdown'); });
  } else {
    const rise = (n(j.rise)>0 && riseCls(n(j.rise))===j.pitch) ? n(j.rise) : (j.pitch==='steep1' ? 8 : j.pitch==='steep2' ? 12 : 0);
    const ad = stepAdd(rise); if (ad>0 && sq>0) add(L.labor, `Pitch adder ${rise}/12`, Math.round(sqSh*100)/100, 'sq', ad);
  }
  const sq2 = n(j.sq2story)>0 ? Math.min(n(j.sq2story), sq) : (n(j.stories)>1 ? sq : 0);
  if (sq2>0 && R('story')>0) add(L.labor, '2-story adder', Math.round(sq2*100)/100, 'sq', R('story'), n(j.sq2story)>0 ? 'scope high-roof squares' : 'whole roof marked 2-story');
  add(L.labor, 'Decking install', n(j.deckSheets), 'sheet', R('deck'));
  add(L.labor, 'Ridge vent install', n(j.ridgeVent), 'lf', R('ridge'));
  add(L.labor, 'Vent cancellations', n(j.ventCancel), 'ea', R('cancel'));
  add(L.labor, 'Wood repair labor', n(j.woodLf), 'lf', R('wood'));
  add(L.labor, 'Trip charges', n(j.tripCharges), 'ea', R('trip'));
  add(L.labor, 'Dumpster / haul-off', n(j.dumpster)>0?1:0, 'job', n(j.dumpster), 'crews include haul-off');
  let labor = L.labor.reduce((s,l)=>s+l.total,0);
  if (n(j.laborKnown)>0){ L.labor = [{label:crewName+' — actual crew invoice from Lynx', qty:1, unit:'job', unitCost:n(j.laborKnown), total:n(j.laborKnown), note:'exact amount billed · replaces the rate-card estimate'}]; labor = n(j.laborKnown); }

  // Trades
  add(L.trades, 'Solar detach & reset — Blue Construction', n(j.panels), 'panel', n(pb.solar_panel));
  const gutLf = n(j.gutterLf);
  if (gutLf>0){ const amt = gutLf*n(pb.gut_lf); if (amt < n(pb.gut_min)) add(L.trades, 'Gutters + downspouts — Flowers (minimum)', 1, 'job', n(pb.gut_min), `${gutLf} lf`); else add(L.trades, 'Gutters + downspouts — Flowers', gutLf, 'lf', n(pb.gut_lf)); }
  add(L.trades, 'Leaf guard — Flowers', n(j.guardLf), 'lf', n(pb.gut_guard));
  add(L.trades, 'Leaf Blaster — Flowers', n(j.blasterLf), 'lf', n(pb.gut_blaster), 'derived');
  add(L.trades, 'Window screens — Mesquite Glass', n(j.screens), 'ea', n(pb.screen));
  add(L.trades, 'Fence wash & stain — Silva', n(j.stainSqft), 'sqft', n(pb.stain_sqft));
  add(L.trades, 'Garage door 16x7 — Gallardo\'s', n(j.garageDoors), 'ea', n(pb.garage) + (j.garageIns ? n(pb.garage_ins) : 0), j.garageIns ? 'insulated' : 'non-insulated');
  add(L.trades, 'Paint / interior — Garcia\'s (quote)', n(j.paintAmt)>0?1:0, 'quote', n(j.paintAmt));
  add(L.trades, 'Other trade (quote)', n(j.otherTrade)>0?1:0, 'quote', n(j.otherTrade));
  const trades = L.trades.reduce((s,l)=>s+l.total,0);

  // Fees
  const permitAmt = j.permit!=='' ? n(j.permit) : (CITIES[j.city] ?? n(pb.permit_default));
  add(L.fees, 'Permit' + (j.city?` — ${j.city}`:''), sq>0?1:0, 'job', permitAmt, j.permit!=='' ? 'entered' : (CITIES[j.city]!=null ? 'your median for this city' : 'default'));
  add(L.fees, 'Inspections — Summit / CROB', n(j.inspections), 'ea', n(pb.inspection));
  add(L.fees, 'Re-inspections', n(j.reinspections), 'ea', n(pb.reinspect));
  add(L.fees, 'Roofr report', j.measure?1:0, 'job', n(pb.measure));
  add(L.fees, 'Supplement write-ups', n(j.supplements), 'ea', n(pb.supp_fee));
  add(L.fees, 'Appraisal — Claim Experts', j.appraisal?1:0, 'job', n(pb.appraisal));
  const fees = L.fees.reduce((s,l)=>s+l.total,0);
  (j.extras||[]).forEach(e => add(L.extras, e.label||'Extra', n(e.amt)>0?1:0, '', n(e.amt)));
  const extras = L.extras.reduce((s,l)=>s+l.total,0);

  const hard = materials + labor + trades + fees + extras;
  const contract = j.jobType==='insurance' ? n(j.rcv)+n(j.suppAmt)+n(j.upgrades) : n(j.contract);
  const gp = contract - hard;
  /* Pay plan (week of Sep 18, 2026): rep % + Mike 2% + team manager 2%, on money received net of processing fee. */
  const repInfo = REPS[j.rep];
  const repRate = j.commPreset==='none' ? 0 : (j.commPreset==='custom' || !repInfo) ? n(j.commRate) : repInfo.rate;
  const teamKey = j.commPreset==='none' ? 'none' : (j.teamMgr==='auto' || !j.teamMgr) ? (repInfo ? repInfo.team : 'none') : j.teamMgr;
  const mikeRate = (j.commPreset!=='none' && j.mikeOvr!==false) ? MGRS.mike.rate : 0;
  const teamRate = (teamKey && MGRS[teamKey]) ? MGRS[teamKey].rate : 0;
  const ovrRate = mikeRate + teamRate;
  const commRate = repRate + ovrRate;
  const feePct = j.payMethod==='card' ? n(pb.fee_card) : j.payMethod==='ach' ? n(pb.fee_ach) : 0;
  const basis = contract>0 ? contract*(1-feePct/100) : 0;
  const repComm = basis*repRate/100, ovrComm = basis*ovrRate/100;
  const commission = repComm + ovrComm;
  const net = gp - commission;
  const gpPct = contract>0 ? gp/contract*100 : NaN, netPct = contract>0 ? net/contract*100 : NaN;
  const target = n(pb.target_net);
  const effComm = commRate/100*(1-feePct/100);
  const priceAtTarget = (1 - target/100 - effComm) > 0 ? hard / (1 - target/100 - effComm) : NaN;
  const baseWk = (n(pb.sales_base_wk) + n(pb.office_base_wk)) * (1 + n(pb.payroll_tax)/100);
  const baseAlloc = n(pb.jobs_per_wk)>0 ? baseWk/n(pb.jobs_per_wk) : 0;
  const netLoaded = net - baseAlloc, netLoadedPct = contract>0 ? netLoaded/contract*100 : NaN;
  let status = {cls:'neutral', text:'No contract yet'};
  if (contract>0){ if (net<0) status={cls:'bad',text:'Loss'}; else if (netPct >= target) status={cls:'good',text:'On target'}; else if (netPct >= target-8) status={cls:'warn',text:'Thin'}; else status={cls:'bad',text:'Below target'}; }
  return {sq: sqTotal, sqShingle: sq, sqFlat, sqSh, L, matSub, tax, delivery, materials, rebate, labor, trades, fees, extras, hard, contract, gp, gpPct, commRate, repRate, ovrRate, mikeRate, teamRate, teamKey, feePct, basis, repComm, ovrComm, commission, net, netPct, baseAlloc, netLoaded, netLoadedPct, target, priceAtTarget, status, crewName,
    perSq:{material: sqTotal>0?materials/sqTotal:NaN, labor: sqTotal>0?labor/sqTotal:NaN, hard: sqTotal>0?hard/sqTotal:NaN, contract: sqTotal>0&&contract>0?contract/sqTotal:NaN},
    homeowner: j.jobType==='insurance' ? n(j.deductible)+n(j.upgrades) : contract, carrier: j.jobType==='insurance' ? n(j.rcv)-n(j.deductible)+n(j.suppAmt) : 0};
}
