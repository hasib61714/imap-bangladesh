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
  {id:13, icon:"🌾", name:"কৃষি ও গ্রামীণ সেবা", nameEn:"Agro & Rural Services", col:"#22C55E", count:89,  avg:"৳৩৫০",  r:4.6,
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
  {id:1,name:"মো. রাকিব হোসেন",nameEn:"Md. Rakib Hossain",svc:"ইলেকট্রিশিয়ান",svcEn:"Electrician",r:4.9,rev:312,price:"৳৩৫০",note:"থেকে শুরু",noteEn:"starting",ok:true,top:true,av:"র",col:"#0D7F5F",score:98,jobs:847,badge:"Top Rated",loc:"মিরপুর, ঢাকা",locEn:"Mirpur, Dhaka",eta:"৮",etaEn:"8",tags:["⚡ বিদ্যুৎ বিশেষজ্ঞ","🔒 বিশ্বস্ত","⏰ সময়মতো"],tagsEn:["⚡ Electrical Expert","🔒 Trusted","⏰ On Time"],loanScore:82,earnings:[1200,1800,900,2100,1600,2800,1400],lat:23.8041,lng:90.3682},
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
