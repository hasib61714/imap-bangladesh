export const SVCS = [
  // 1. Emergency
  {id:1, icon:"🚨", name:"জরুরি সেবা",          nameEn:"Emergency Services",   col:"#EF4444", count:89,  avg:"৳বিনামূল্যে",r:4.9,
   subs:["অ্যাম্বুলেন্স","জরুরি নার্স","অক্সিজেন সিলিন্ডার","রক্তদাতা","জরুরি ডাক্তার","জরুরি ইলেকট্রিশিয়ান","গ্যাস লিক","জরুরি মেকানিক","ট্র্যাকশন সেবা"],
   subsEn:["Ambulance","Emergency Nurse","Oxygen Cylinder","Blood Donor","Emergency Doctor","Emergency Electrician","Gas Leak Support","Emergency Mechanic","Towing Service"]},

  // 2. Home Maintenance
  {id:2, icon:"🏠", name:"গৃহ রক্ষণাবেক্ষণ",    nameEn:"Home Maintenance",      col:"#F59E0B", count:312, avg:"৳৩৫০",  r:4.8,
   subs:["ইলেকট্রিশিয়ান","প্লাম্বার","কার্পেন্টার","রঙ মিস্ত্রি","রাজমিস্ত্রি","টাইলস ফিক্সিং","এসি মেরামত","ফ্রিজ মেরামত","ওয়াশিং মেশিন","জেনারেটর মেরামত"],
   subsEn:["Electrician","Plumber","Carpenter","Painter","Mason","Tile Fixing","AC Repair","Refrigerator Repair","Washing Machine Repair","Generator Repair"]},

  // 3. Cleaning
  {id:3, icon:"🧹", name:"পরিষ্কার সেবা",       nameEn:"Cleaning Services",     col:"#14B8A6", count:124, avg:"৳৪০০",  r:4.7,
   subs:["ডিপ হোম ক্লিনিং","নিয়মিত কাজের মেয়ে","রান্নাঘর পরিষ্কার","বাথরুম পরিষ্কার","সোফা ক্লিনিং","কার্পেট ক্লিনিং","পানির ট্যাংক পরিষ্কার"],
   subsEn:["Deep Home Cleaning","Regular Maid","Kitchen Cleaning","Bathroom Cleaning","Sofa Cleaning","Carpet Cleaning","Water Tank Cleaning"]},

  // 4. Home Healthcare
  {id:4, icon:"👩‍⚕️", name:"স্বাস্থ্যসেবা",       nameEn:"Home Healthcare",       col:"#EF4444", count:203, avg:"৳৫০০",  r:4.9,
   subs:["বাড়িতে নার্স","কেয়ারগিভার","ফিজিওথেরাপি","বয়স্ক সেবা","শিশু সেবা","ইনজেকশন ও ড্রেসিং"],
   subsEn:["Nurse at Home","Caregiver","Physiotherapy","Elder Care","Baby Care","Injection & Dressing"]},

  // 5. Education
  {id:5, icon:"📚", name:"শিক্ষা সেবা",         nameEn:"Education & Learning",  col:"#8B5CF6", count:315, avg:"৳৪০০",  r:4.8,
   subs:["গৃহশিক্ষক","অনলাইন টিউটর","কোরআন শিক্ষক","ভাষা শিক্ষক","কম্পিউটার প্রশিক্ষণ","দক্ষতা উন্নয়ন প্রশিক্ষক"],
   subsEn:["Home Tutor","Online Tutor","Quran Teacher","Language Tutor","Computer Training","Skill Development Trainer"]},

  // 6. Moving & Transport
  {id:6, icon:"🚚", name:"স্থানান্তর ও পরিবহন", nameEn:"Moving & Transport",    col:"#F97316", count:56,  avg:"৳২০০০", r:4.5,
   subs:["বাড়ি স্থানান্তর","আসবাব সরানো","ট্রাক ভাড়া","প্যাকিং আনপ্যাকিং","কুরিয়ার ও পার্সেল"],
   subsEn:["House Shifting","Furniture Moving","Truck Rental","Packing & Unpacking","Courier & Parcel"]},

  // 7. Food & Cooking
  {id:7, icon:"🍲", name:"রান্না ও খাবার সেবা", nameEn:"Food & Cooking",        col:"#F59E0B", count:74,  avg:"৳৬০০",  r:4.7,
   subs:["গৃহ রাঁধুনি","দৈনিক খাবার সেবা","অনুষ্ঠানের রান্না","ক্যাটারিং","টিফিন সার্ভিস"],
   subsEn:["Home Cook","Daily Meal Service","Event Cooking","Catering","Tiffin Service"]},

  // 8. Professional
  {id:8, icon:"🧑‍💼", name:"পেশাদার পরামর্শ",    nameEn:"Professional Services", col:"#6366F1", count:112, avg:"৳৮০০",  r:4.6,
   subs:["আইনজীবী পরামর্শ","হিসাবরক্ষক","ট্যাক্স পরামর্শদাতা","নোটারি সার্ভিস","ডকুমেন্ট লেখা","IT সাপোর্ট","মোবাইল ও কম্পিউটার মেরামত"],
   subsEn:["Lawyer Consultation","Accountant","Tax Consultant","Notary Service","Document Writing","IT Support","Mobile & Computer Repair"]},

  // 9. Security
  {id:9, icon:"🛡️", name:"নিরাপত্তা সেবা",     nameEn:"Security Services",    col:"#374151", count:38,  avg:"৳৫০০",  r:4.7,
   subs:["নিরাপত্তা প্রহরী","CCTV স্থাপন","নিরাপত্তা পরিদর্শন","অগ্নি নিরাপত্তা"],
   subsEn:["Security Guard","CCTV Installation","Safety Inspection","Fire Safety Setup"]},

  // 10. Daily Errands
  {id:10, icon:"🛒", name:"দৈনন্দিন সহায়তা",   nameEn:"Daily Errands",        col:"#EC4899", count:92,  avg:"৳১৫০",  r:4.6,
   subs:["ওষুধ সংগ্রহ","বাজার সহায়তা","ডকুমেন্ট ডেলিভারি","লাইনে দাঁড়ানো","বিল পেমেন্ট সহায়তা"],
   subsEn:["Medicine Pickup","Grocery Assistance","Document Delivery","Queue Standing","Bill Payment Help"]},

  // 11. Elderly Assistance
  {id:11, icon:"🧓", name:"বয়স্ক সেবা",         nameEn:"Elderly Assistance",   col:"#7C3AED", count:47,  avg:"৳৪০০",  r:4.9,
   subs:["হাসপাতাল ভিজিট সহায়তা","ওষুধ রিমাইন্ডার","দৈনিক কার্যক্রম সহায়তা","সঙ্গ সেবা"],
   subsEn:["Hospital Visit Help","Medicine Reminder","Daily Activity Help","Companionship Service"]},

  // 12. Child & Family
  {id:12, icon:"👶", name:"শিশু ও পরিবার সেবা", nameEn:"Child & Family Support",col:"#DB2777", count:63,  avg:"৳৪০০",  r:4.8,
   subs:["বেবিসিটিং","শিশু পরিচর্যা","স্কুল পিকআপ/ড্রপ","শিশু পড়ানো"],
   subsEn:["Babysitting","Child Care","School Pickup/Drop","Child Tutoring"]},

  // 13. Agro & Rural
  {id:13, icon:"🌾", name:"কৃষি ও গ্রামীণ সেবা", nameEn:"Agro & Rural Services", col:"#00C170", count:89,  avg:"৳৩৫০",  r:4.6,
   subs:["পশু চিকিৎসক","খামার শ্রমিক","পশুপালন চিকিৎসা","খাদ্য ডেলিভারি","ফসল কাটার সহায়তা"],
   subsEn:["Veterinary Doctor","Farm Worker","Livestock Treatment","Feed Delivery","Crop Harvesting"]},

  // 14. Events
  {id:14, icon:"🎉", name:"ইভেন্ট ও ব্যক্তিগত",nameEn:"Event & Personal",      col:"#F43F5E", count:58,  avg:"৳১৫০০", r:4.7,
   subs:["ইভেন্ট ডেকোরেশন","ফটোগ্রাফি ও ভিডিওগ্রাফি","মেকআপ আর্টিস্ট","বিবাহ সেবা","ডিজে ও সাউন্ড সিস্টেম"],
   subsEn:["Event Decoration","Photography & Videography","Makeup Artist","Bridal Services","DJ & Sound System"]},

  // 15. Lifestyle
  {id:15, icon:"🧵", name:"ব্যক্তিগত জীবনধারা", nameEn:"Personal Lifestyle",    col:"#A855F7", count:96,  avg:"৳৩০০",  r:4.7,
   subs:["টেইলারিং","লন্ড্রি ও ইস্ত্রি","সেলুন ও বিউটি","ম্যাসাজ ও ওয়েলনেস","ফিটনেস ট্রেইনার"],
   subsEn:["Tailoring","Laundry & Ironing","Salon & Beauty","Massage & Wellness","Fitness Trainer"]},

  // 16. Repair & Technical
  {id:16, icon:"🔧", name:"মেরামত ও প্রযুক্তি",  nameEn:"Repair & Technical",   col:"#3B82F6", count:143, avg:"৳৩৫০",  r:4.6,
   subs:["মোবাইল মেরামত","ল্যাপটপ মেরামত","টিভি মেরামত","ইন্টারনেট সেটআপ","WiFi সমস্যা সমাধান"],
   subsEn:["Mobile Repair","Laptop Repair","TV Repair","Internet Setup","WiFi Troubleshooting"]},

  // 17. Smart & Digital
  {id:17, icon:"🧠", name:"স্মার্ট সহায়তা",     nameEn:"Smart & Digital Help",  col:"#0EA5E9", count:41,  avg:"৳২০০",  r:4.8,
   subs:["অনলাইন ফর্ম পূরণ","সরকারি সেবা সহায়তা","পাসপোর্ট/ভিসা গাইড","অনলাইন টিকিট বুকিং"],
   subsEn:["Online Form Fill-up","Govt Service Help","Passport/Visa Guide","Online Ticket Booking"]},

  // 18. Utility Installation
  {id:18, icon:"🚿", name:"ইউটিলিটি স্থাপন",    nameEn:"Utility Installation",  col:"#06B6D4", count:52,  avg:"৳৫০০",  r:4.7,
   subs:["পানির ফিল্টার স্থাপন","সোলার প্যানেল সেটআপ","IPS স্থাপন","গ্যাসের চুলা স্থাপন"],
   subsEn:["Water Filter Install","Solar Panel Setup","IPS Installation","Gas Stove Installation"]},

  // 19. Beauty & Salon
  {id:19, icon:"💅", name:"বিউটি ও সেলুন",      nameEn:"Beauty & Salon",        col:"#EC4899", count:138, avg:"৳৩৫০",  r:4.8,
   subs:["মেকআপ ও ফেশিয়াল","হেয়ারকাট ও স্টাইল","ব্রাইডাল মেকআপ","মেহেদি আর্ট","নেইল আর্ট","স্পা ও স্ক্রাব","আইব্রো ও থ্রেডিং","হেয়ার কালার","ম্যাসাজ থেরাপি","স্কিন কেয়ার ট্রিটমেন্ট"],
   subsEn:["Makeup & Facial","Haircut & Styling","Bridal Makeup","Mehndi Art","Nail Art","Spa & Scrub","Eyebrow & Threading","Hair Coloring","Massage Therapy","Skin Care Treatment"]},
];

export const PROVIDERS = [
  {id:1,name:"মো. রাকিব হোসেন",nameEn:"Md. Rakib Hossain",svc:"ইলেকট্রিশিয়ান",svcEn:"Electrician",r:4.9,rev:312,price:"৳৩৫০",note:"থেকে শুরু",noteEn:"starting",ok:true,top:true,av:"র",col:"#004D38",score:98,jobs:847,badge:"Top Rated",loc:"মিরপুর, ঢাকা",locEn:"Mirpur, Dhaka",eta:"৮",etaEn:"8",tags:["⚡ বিদ্যুৎ বিশেষজ্ঞ","🔒 বিশ্বস্ত","⏰ সময়মতো"],tagsEn:["⚡ Electrical Expert","🔒 Trusted","⏰ On Time"],loanScore:82,earnings:[1200,1800,900,2100,1600,2800,1400],lat:23.8041,lng:90.3682},
  {id:2,name:"ফারজানা আক্তার",nameEn:"Farzana Akter",svc:"নার্স",svcEn:"Nurse",r:4.8,rev:189,price:"৳৫০০",note:"প্রতি ঘণ্টা",noteEn:"per hour",ok:true,top:true,av:"ফ",col:"#7C3AED",score:95,jobs:423,badge:"Level 2",loc:"গুলশান, ঢাকা",locEn:"Gulshan, Dhaka",eta:"১২",etaEn:"12",tags:["🏥 স্বাস্থ্যসেবা","✅ NID যাচাই"],tagsEn:["🏥 Healthcare","✅ NID Verified"],loanScore:74,earnings:[1100,1500,1300,1900,1700,2200,1600],lat:23.7925,lng:90.4144},
  {id:3,name:"মো. সাজিদ আলী",nameEn:"Md. Sajid Ali",svc:"প্লাম্বার",svcEn:"Plumber",r:4.7,rev:245,price:"৳২৮০",note:"থেকে শুরু",noteEn:"starting",ok:true,top:false,av:"স",col:"#2563EB",score:92,jobs:612,badge:"Level 1",loc:"ধানমন্ডি, ঢাকা",locEn:"Dhanmondi, Dhaka",eta:"১৫",etaEn:"15",tags:["🔧 পাইপলাইন বিশেষজ্ঞ"],tagsEn:["🔧 Pipeline Expert"],loanScore:68,earnings:[800,1100,700,1300,1000,1600,900],lat:23.7461,lng:90.3742},
  {id:4,name:"নাসরিন বেগম",nameEn:"Nasrin Begum",svc:"গৃহশিক্ষক",svcEn:"Home Tutor",r:4.9,rev:156,price:"৳৪০০",note:"প্রতি সেশন",noteEn:"per session",ok:true,top:true,av:"না",col:"#DB2777",score:97,jobs:289,badge:"Top Rated",loc:"উত্তরা, ঢাকা",locEn:"Uttara, Dhaka",eta:"৬",etaEn:"6",tags:["📚 SSC/HSC","🏆 ১০ বছর"],tagsEn:["📚 SSC/HSC","🏆 10 Years"],loanScore:91,earnings:[1400,1800,1600,2000,1900,2400,1700],lat:23.8759,lng:90.3795},
  {id:5,name:"করিম মিয়া",nameEn:"Karim Mia",svc:"এসি সার্ভিস",svcEn:"AC Service",r:4.8,rev:201,price:"৳৪৫০",note:"থেকে শুরু",noteEn:"starting",ok:true,top:false,av:"ক",col:"#0891B2",score:94,jobs:503,badge:"Level 2",loc:"বারিধারা, ঢাকা",locEn:"Baridhara, Dhaka",eta:"১০",etaEn:"10",tags:["❄️ AC মেরামত","🔧 সার্ভিসিং"],tagsEn:["❄️ AC Repair","🔧 Servicing"],loanScore:79,earnings:[1300,1700,1200,1800,1600,2100,1400],lat:23.7987,lng:90.4251},
  {id:6,name:"সুমাইয়া রহমান",nameEn:"Sumaiya Rahman",svc:"ফিজিওথেরাপি",svcEn:"Physiotherapy",r:4.9,rev:98,price:"৳৫৫০",note:"প্রতি সেশন",noteEn:"per session",ok:true,top:true,av:"সু",col:"#7C3AED",score:96,jobs:187,badge:"Top Rated",loc:"বনানী, ঢাকা",locEn:"Banani, Dhaka",eta:"২০",etaEn:"20",tags:["💆 থেরাপি","🏥 BSMMU সার্টিফাইড"],tagsEn:["💆 Therapy","🏥 BSMMU Certified"],loanScore:88,earnings:[1600,2000,1800,2200,2100,2600,1900],lat:23.7937,lng:90.4012},
];

export const MY_BOOKINGS = [
  {id:"BK-4521",svc:"ইলেকট্রিশিয়ান",svcEn:"Electrician",provider:"মো. রাকিব হোসেন",providerEn:"Md. Rakib Hossain",status:"সম্পন্ন",statusEn:"Completed",date:"আজ, ১০:৩০ AM",dateEn:"Today, 10:30 AM",price:"৳৩৮৫",icon:"⚡",pid:1},
  {id:"BK-4520",svc:"পরিষ্কার সেবা",svcEn:"Cleaning",provider:"নাসরিন বেগম",providerEn:"Nasrin Begum",status:"চলমান",statusEn:"Ongoing",date:"আজ, ২:০০ PM",dateEn:"Today, 2:00 PM",price:"৳৪৩৫",icon:"🧹",pid:4},
  {id:"BK-4519",svc:"প্লাম্বার",svcEn:"Plumber",provider:"মো. সাজিদ আলী",providerEn:"Md. Sajid Ali",status:"বাতিল",statusEn:"Cancelled",date:"গতকাল",dateEn:"Yesterday",price:"৳৩১৫",icon:"🔧",pid:3},
  {id:"BK-4518",svc:"নার্স",svcEn:"Nurse",provider:"ফারজানা আক্তার",providerEn:"Farzana Akter",status:"সম্পন্ন",statusEn:"Completed",date:"৩ দিন আগে",dateEn:"3 days ago",price:"৳৫৩৫",icon:"🏥",pid:2},
];

export const NOTIFS_DATA = [
  {id:1,icon:"✅",t:"বুকিং নিশ্চিত!",tEn:"Booking Confirmed!",m:"রাকিব হোসেন ৮ মিনিটে আসছেন",mEn:"Rakib Hossain arriving in 8 minutes",time:"২ মি",timeEn:"2m",unread:true,type:"booking"},
  {id:2,icon:"🎁",t:"বিশেষ অফার!",tEn:"Special Offer!",m:"আজ ২০% ছাড় — প্রথম ৫০ বুকিং",mEn:"20% off today — first 50 bookings",time:"১ ঘ",timeEn:"1h",unread:true,type:"promo"},
  {id:3,icon:"🔔",t:"রিভিউ দিন",tEn:"Give a Review",m:"গতকালের সেবা কেমন ছিল?",mEn:"How was yesterday's service?",time:"৩ ঘ",timeEn:"3h",unread:false,type:"info"},
  {id:4,icon:"🚨",t:"জরুরি আপডেট",tEn:"Urgent Update",m:"আপনার এলাকায় বন্যা সতর্কতা",mEn:"Flood warning in your area",time:"৫ ঘ",timeEn:"5h",unread:false,type:"alert"},
  {id:5,icon:"💰",t:"পেমেন্ট সফল",tEn:"Payment Successful",m:"৳৩৮৫ bKash-এ পরিশোধিত",mEn:"৳385 paid via bKash",time:"গতকাল",timeEn:"Yesterday",unread:false,type:"payment"},
];


// ── Mock/demo data moved out of App.jsx ──────────────────
export const CAL_SLOTS = {
  morning:  ["8:00 AM","9:00 AM","10:00 AM","11:00 AM"],
  afternoon:["12:00 PM","1:00 PM","2:00 PM","3:00 PM"],
  evening:  ["4:00 PM","5:00 PM","6:00 PM","7:00 PM"],
};
export const AN_MONTHS=["Jul","Aug","Sep","Oct","Nov","Dec","Jan"];
export const AN_DATA=[2,3,1,4,3,5,4];
export const AN_SERVICES=[{icon:"⚡",name:"Electrical",nameBn:"ইলেকট্রিক",pct:32,color:"#F59E0B"},{icon:"🧹",name:"Cleaning",nameBn:"পরিষ্কার",pct:24,color:"#00C170"},{icon:"🔧",name:"Plumber",nameBn:"প্লাম্বার",pct:18,color:"#3B82F6"},{icon:"🏥",name:"Medical",nameBn:"চিকিৎসা",pct:15,color:"#EF4444"},{icon:"📚",name:"Tutoring",nameBn:"শিক্ষা",pct:11,color:"#8B5CF6"}];
export const AN_ACTIVITY=[{icon:"⚡",title:"Electrician booked",titleBn:"ইলেকট্রিশিয়ান বুক",date:"Today, 10:30 AM",amt:-385},{icon:"⭐",title:"Rated Farzana 5★",titleBn:"ফারজানাকে ৫★ দিলেন",date:"Yesterday",amt:0},{icon:"💳",title:"Wallet topped up",titleBn:"ওয়ালেট টপআপ",date:"2 days ago",amt:1000},{icon:"🔧",title:"Plumber booking",titleBn:"প্লাম্বার বুকিং",date:"3 days ago",amt:-280}];
export const SR_TYPES=["electrical","plumbing","cleaning","medical","tutoring","carpentry","painting","ac_repair"];
export const SR_TIMES=["08:00-10:00","10:00-12:00","12:00-14:00","14:00-16:00","16:00-18:00","18:00-20:00"];
export const LOYALTY_REWARDS=[{pts:500,icon:"🎟️",titleEn:"₹50 off next booking",titleBn:"পরবর্তী বুকিং ৳৫০ ছাড়",code:"LY500"},{pts:1000,icon:"🎁",titleEn:"Free cleaning service",titleBn:"ফ্রি পরিষ্কার সেবা",code:"LY1000"},{pts:2000,icon:"⭐",titleEn:"Priority matching",titleBn:"অগ্রাধিকার ম্যাচিং",code:"LY2000"},{pts:5000,icon:"🏆",titleEn:"1 month premium",titleBn:"১ মাস প্রিমিয়াম",code:"LY5000"}];
export const LEVELS=[{name:"Bronze",nameBn:"ব্রোন্জ",min:0,max:500,color:"#CD7F32",icon:"🥉"},{name:"Silver",nameBn:"সিলভার",min:500,max:1500,color:"#C0C0C0",icon:"🥈"},{name:"Gold",nameBn:"গোল্ড",min:1500,max:3000,color:"#FFD700",icon:"🥇"},{name:"Platinum",nameBn:"প্লাটিনাম",min:3000,max:6000,color:"#E5E4E2",icon:"💎"}];
export const LY_HISTORY=[{icon:"⚡",titleEn:"Booked Electrician",titleBn:"ইলেকট্রিশিয়ান বুক",pts:+38,date:"Today"},{icon:"🎟️",titleEn:"Referral bonus",titleBn:"রেফারেল বোনাস",pts:+50,date:"Yesterday"},{icon:"🧹",titleEn:"Booked Cleaning",titleBn:"পরিষ্কার বুক",pts:+43,date:"2 days ago"},{icon:"💸",titleEn:"Redeemed coupon",titleBn:"কুপন রিডিম",pts:-200,date:"3 days ago"}];
export const RF_FRIENDS=[{name:"Karim Ahmed",nameEn:"Karim Ahmed",status:"active",earned:150,date:"Jan 12"},{name:"Nasrin Khatun",nameEn:"Nasrin Khatun",status:"active",earned:150,date:"Jan 8"},{name:"Alam Hossain",nameEn:"Alam Hossain",status:"pending",earned:0,date:"Jan 5"}];
export const RF_STEPS=[{icon:"📲",en:"Share your code with friends",bn:"বন্ধুদের সাথে কোড শেয়ার করুন"},{icon:"✅",en:"Friend signs up & books a service",bn:"বন্ধু নিবন্ধন ও বুকিং করেন"},{icon:"💰",en:"You both earn ৳150 bonus",bn:"আপনি উভয়ই ৳১৫০ বোনাস পাবেন"}];
export const PF_PROVIDERS=[{id:1,name:"Md. Rakib",skill:"Electrician",exp:7,rating:4.9,jobs:320,skills:["Wiring","AC","Solar","Generator"],about:"7 বছরের অভিজ্ঞ ইলেকট্রিশিয়ান। ঢাকার সকল এলাকায় সেবা প্রদান।",aboutEn:"7-year experienced electrician serving all Dhaka areas.",gallery:["⚡","🔌","💡","🔧","⚙️","🛠️"]},{id:4,name:"Nasrin Begum",skill:"Cleaner",exp:5,rating:4.7,jobs:285,skills:["Deep Clean","Office","Post-Const","Kitchen"],about:"পেশাদার পরিষ্কারকর্মী। শতভাগ সন্তুষ্টি নিশ্চিত।",aboutEn:"Professional cleaner with 100% satisfaction guarantee.",gallery:["🧹","🧺","✨","🏠","🪣","🧽"]}];
export const REG_SERVICES=["Electrical","Plumbing","Cleaning","Nursing","Carpentry","Painting","AC Repair","Tutoring","Gardening","Security"];
export const PA_MONTHS=["Aug","Sep","Oct","Nov","Dec","Jan"];
export const PA_EARNINGS=[8200,9500,7800,11200,10800,12500];
export const PA_REVIEWS=[{name:"Rahim U.",stars:5,text:"অসাধারণ সেবা! সময়মতো এসেছেন।",textEn:"Excellent service! Arrived on time.",date:"Today"},{name:"Sultana B.",stars:4,text:"ভালো কাজ, দাম সঠিক।",textEn:"Good work, fair price.",date:"Yesterday"},{name:"Karim A.",stars:5,text:"100% সুপারিশ করব।",textEn:"100% recommended.",date:"3 days ago"}];
export const SC_COURSES=[{id:1,icon:"⚡",titleEn:"Certified Electrician",titleBn:"সার্টিফাইড ইলেকট্রিশিয়ান",duration:"4 weeks",durationBn:"৪ সপ্তাহ",level:"Beginner",pts:200,issued:"Nov 2024"},{id:2,icon:"🔧",titleEn:"Plumbing Professional",titleBn:"প্লাম্বিং পেশাদার",duration:"3 weeks",durationBn:"৩ সপ্তাহ",level:"Intermediate",pts:250,issued:null},{id:3,icon:"🧹",titleEn:"Home Cleaning Expert",titleBn:"গৃহ পরিষ্কার বিশেষজ্ঞ",duration:"2 weeks",durationBn:"২ সপ্তাহ",level:"Beginner",pts:150,issued:null},{id:4,icon:"🏥",titleEn:"Home Nursing Basics",titleBn:"হোম নার্সিং বেসিক",duration:"6 weeks",durationBn:"৬ সপ্তাহ",level:"Advanced",pts:300,issued:"Dec 2024"},{id:5,icon:"❄️",titleEn:"AC Technician",titleBn:"এসি টেকনিশিয়ান",duration:"3 weeks",durationBn:"৩ সপ্তাহ",level:"Intermediate",pts:250,issued:null}];
export const COUPONS = [
  {code:"IMAP20",pct:20,maxTk:150,minOrder:300,cat:"all",expiry:"31 Jan",uses:1240,limit:2000,tag:"hot",descBn:"সব সেবায় ২০% ছাড়",descEn:"20% off all services"},
  {code:"FIRST50",pct:50,maxTk:200,minOrder:200,cat:"all",expiry:"28 Feb",uses:890,limit:1000,tag:"new",descBn:"প্রথম বুকিংয়ে ৫০% ছাড়",descEn:"50% off your first booking"},
  {code:"ELEC15",pct:15,maxTk:120,minOrder:250,cat:"electrical",expiry:"15 Feb",uses:340,limit:500,tag:"",descBn:"ইলেকট্রিক সেবায় ১৫% ছাড়",descEn:"15% off electrical services"},
  {code:"CLEAN30",pct:30,maxTk:180,minOrder:300,cat:"cleaning",expiry:"20 Jan",uses:620,limit:800,tag:"",descBn:"গৃহপরিচ্ছন্নতায় ৩০% ছাড়",descEn:"30% off cleaning services"},
  {code:"NURSE10",pct:10,maxTk:100,minOrder:400,cat:"medical",expiry:"28 Feb",uses:180,limit:300,tag:"new",descBn:"নার্সিং সেবায় ১০% ছাড়",descEn:"10% off nursing services"},
  {code:"FLASH40",pct:40,maxTk:250,minOrder:500,cat:"all",expiry:"Today!",uses:1890,limit:2000,tag:"flash",descBn:"ফ্ল্যাশ সেল — ৪০% ছাড়",descEn:"Flash sale — 40% off"},
];
export const PROMO_CATS=["all","electrical","cleaning","medical","plumbing","tutoring"];
export const TRANSACTIONS = [
  {id:"TXN-9021",icon:"⚡",type:"payment",titleBn:"ইলেকট্রিশিয়ান সেবা",titleEn:"Electrician Service",provider:"Md. Rakib",amount:-385,method:"bKash",date:"আজ, ১০:৩০ AM",dateEn:"Today 10:30 AM",status:"success"},
  {id:"TXN-9020",icon:"🔄",type:"refund",titleBn:"বুকিং বাতিল ফেরত",titleEn:"Booking Cancellation Refund",provider:"System",amount:+315,method:"Wallet",date:"আজ, ৮:০০ AM",dateEn:"Today 8:00 AM",status:"success"},
  {id:"TXN-9019",icon:"🏥",type:"payment",titleBn:"নার্সিং সেবা",titleEn:"Nursing Service",provider:"Farzana Akter",amount:-535,method:"Nagad",date:"গতকাল",dateEn:"Yesterday",status:"success"},
  {id:"TXN-9018",icon:"💳",type:"topup",titleBn:"ওয়ালেট টপআপ",titleEn:"Wallet Top Up",provider:"bKash",amount:+1000,method:"bKash",date:"২ দিন আগে",dateEn:"2 days ago",status:"success"},
  {id:"TXN-9017",icon:"🔧",type:"payment",titleBn:"প্লাম্বার সেবা",titleEn:"Plumber Service",provider:"Md. Sajid",amount:-280,method:"Wallet",date:"৩ দিন আগে",dateEn:"3 days ago",status:"success"},
  {id:"TXN-9016",icon:"❄️",type:"payment",titleBn:"AC সার্ভিস",titleEn:"AC Service",provider:"Karim Mia",amount:-450,method:"Rocket",date:"৫ দিন আগে",dateEn:"5 days ago",status:"success"},
  {id:"TXN-9015",icon:"💳",type:"topup",titleBn:"ওয়ালেট টপআপ",titleEn:"Wallet Top Up",provider:"Nagad",amount:+500,method:"Nagad",date:"৭ দিন আগে",dateEn:"7 days ago",status:"success"},
  {id:"TXN-9014",icon:"📚",type:"payment",titleBn:"গৃহশিক্ষক সেবা",titleEn:"Home Tutor Session",provider:"Nasrin Begum",amount:-400,method:"bKash",date:"১০ দিন আগে",dateEn:"10 days ago",status:"success"},
];
export const TOPUP_AMOUNTS=[100,200,500,1000,2000,5000];
export const TOPUP_METHODS=[{id:"bkash",label:"bKash",icon:"🟣"},{id:"nagad",label:"Nagad",icon:"🟠"},{id:"rocket",label:"Rocket",icon:"🟤"},{id:"card",label:"Card",icon:"💳"}];
export const BLOOD_GROUPS=["A+","A-","B+","B-","AB+","AB-","O+","O-"];
export const DONORS=[
  {id:1,name:"মো. কাদের",nameEn:"Md. Kader",bg:"A+",loc:"মিরপুর",locEn:"Mirpur",phone:"01700-000001",lastDon:"3",dist:0.8,dons:12,avail:true,lat:23.8041,lng:90.3660},
  {id:2,name:"রুমা খানম",nameEn:"Ruma Khanam",bg:"O+",loc:"গুলশান",locEn:"Gulshan",phone:"01700-000002",lastDon:"5",dist:1.9,dons:8,avail:true,lat:23.7860,lng:90.4158},
  {id:3,name:"তারিক ইসলাম",nameEn:"Tariq Islam",bg:"B+",loc:"ধানমন্ডি",locEn:"Dhanmondi",phone:"01700-000003",lastDon:"2",dist:2.4,dons:20,avail:false,lat:23.7461,lng:90.3742},
  {id:4,name:"সাদিয়া ইসলাম",nameEn:"Sadia Islam",bg:"AB+",loc:"উত্তরা",locEn:"Uttara",phone:"01700-000004",lastDon:"6",dist:5.1,dons:5,avail:true,lat:23.8759,lng:90.3795},
  {id:5,name:"হাসান আলী",nameEn:"Hasan Ali",bg:"O-",loc:"বারিধারা",locEn:"Baridhara",phone:"01700-000005",lastDon:"4",dist:3.2,dons:15,avail:true,lat:23.7937,lng:90.4241},
  {id:6,name:"নাজমা বেগম",nameEn:"Najma Begum",bg:"A-",loc:"বনানী",locEn:"Banani",phone:"01700-000006",lastDon:"7",dist:1.5,dons:3,avail:true,lat:23.7936,lng:90.4052},
  {id:7,name:"রাফিউল আলম",nameEn:"Rafiul Alam",bg:"B-",loc:"মোহাম্মদপুর",locEn:"Mohammadpur",phone:"01700-000007",lastDon:"8",dist:2.8,dons:9,avail:false,lat:23.7528,lng:90.3564},
  {id:8,name:"সিনথিয়া আক্তার",nameEn:"Sinthy Akter",bg:"AB-",loc:"রামপুরা",locEn:"Rampura",phone:"01700-000008",lastDon:"1",dist:4.0,dons:2,avail:true,lat:23.7628,lng:90.4243},
];
export const BG_COL_MAP={"A+":"#DC2626","A-":"#EF4444","B+":"#2563EB","B-":"#3B82F6","AB+":"#7C3AED","AB-":"#8B5CF6","O+":"#D97706","O-":"#F59E0B"};
