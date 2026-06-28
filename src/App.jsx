import { useState, useEffect, useRef } from 'react';
import bonyanDatabase from '../bonyan_database.json';
import { db } from './firebase';
import { ref, set, onValue, update } from 'firebase/database';


const INITIAL_ADMINS = [
  { id: 'a1', name: 'عمر الخطاب', email: 'admin@bonyan.com', password: '123' }
];

const INITIAL_STORE = [
  { id: 'p1', name: 'ساعة ذكية رياضية', image: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=300', price: 400, stock: 5 },
  { id: 'p2', name: 'مصحف تجويد ملون فاخر', image: 'https://images.unsplash.com/photo-1609599006353-e629f1d40939?w=300', price: 150, stock: 12 },
  { id: 'p3', name: 'سماعات بلوتوث عازلة للصوت', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300', price: 300, stock: 8 },
  { id: 'p4', name: 'لعبة تركيب مكعبات ذكية', image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=300', price: 100, stock: 0 }
];

const INITIAL_GRADING_HISTORY = [];

// Helper: Get local date string in YYYY-MM-DD format (local timezone)
const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper: Generate unique ID to ensure purity during render cycles
const generateUniqueId = (prefix) => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper: Generate teacher username suffix
const generateTeacherUsernameSuffix = () => {
  return Date.now().toString().slice(-4);
};

// Helper: Calculate Student Quranic Rank based on points
const getStudentRankName = (totalPoints) => {
  if (totalPoints >= 650) return 'حافظ القرآن';
  if (totalPoints >= 400) return 'صاحب القرآن';
  if (totalPoints >= 150) return 'قارئ القرآن';
  return 'طالب القرآن';
};

function App() {
  const isIncomingCloudUpdate = useRef(false);
  const prevStudentsRef = useRef(null);
  const prevClassroomsRef = useRef(null);
  const prevTeachersRef = useRef(null);
  const prevAdminsRef = useRef(null);
  const prevStoreProductsRef = useRef(null);
  const prevGradingHistoryRef = useRef(null);
  const prevPurchaseOrdersRef = useRef(null);
  const prevAiUsageRef = useRef(null);
  
  // Database States loaded from localStorage or bonyan_database.json (which contains the 379 students)
  const [students, setStudents] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bonyan_students_v3'));
      return Array.isArray(saved) ? saved : bonyanDatabase.students;
    } catch {
      return bonyanDatabase.students;
    }
  });

  const [classrooms, setClassrooms] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bonyan_classrooms_v3'));
      const base = Array.isArray(saved) ? saved : bonyanDatabase.classrooms;
      return base.map(c => (c.teacherId === 't1' || c.teacherId === 't2') ? { ...c, teacherId: '' } : c);
    } catch {
      return bonyanDatabase.classrooms.map(c => (c.teacherId === 't1' || c.teacherId === 't2') ? { ...c, teacherId: '' } : c);
    }
  });

  const [teachers, setTeachers] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bonyan_teachers_v3'));
      const base = Array.isArray(saved) ? saved : bonyanDatabase.teachers;
      return base.filter(t => t.id !== 't1' && t.id !== 't2');
    } catch {
      return bonyanDatabase.teachers.filter(t => t.id !== 't1' && t.id !== 't2');
    }
  });

  const [admins, setAdmins] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bonyan_admins_v3'));
      return Array.isArray(saved) ? saved : (bonyanDatabase.admins || INITIAL_ADMINS);
    } catch {
      return bonyanDatabase.admins || INITIAL_ADMINS;
    }
  });
  
  const [storeProducts, setStoreProducts] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bonyan_store_v3'));
      return Array.isArray(saved) ? saved : INITIAL_STORE;
    } catch {
      return INITIAL_STORE;
    }
  });

  const [gradingHistory, setGradingHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bonyan_grading_history_v3'));
      const base = Array.isArray(saved) ? saved : INITIAL_GRADING_HISTORY;
      return base.filter(item => item.id !== 'g1' && item.id !== 'g2');
    } catch {
      return [];
    }
  });

  const [purchaseOrders, setPurchaseOrders] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bonyan_orders_v3'));
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  // Auth States
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bonyan_logged_in_v3'));
      return typeof saved === 'boolean' ? saved : false;
    } catch {
      return false;
    }
  });

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bonyan_current_user_v3')) || null;
    } catch {
      return null;
    }
  });

  // Single Login form inputs
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Layout tabs
  const [studentTab, setStudentTab] = useState('dashboard'); // 'dashboard' | 'store' | 'lessons' | 'ai' | 'profile'
  const [teacherTabState, setTeacherTabState] = useState('classroom'); // 'classroom' | 'lessons' | 'profile'
  const [adminTab, setAdminTab] = useState('store');
  const [storeSubTab, setStoreSubTab] = useState('orders');

  
  // Roster / grading workflow
  const [selectedStudentId, setSelectedStudentId] = useState(null); // For teacher/admin grading view
  const [showGradingPopup, setShowGradingPopup] = useState(false);
  const [currentGradingData, setCurrentGradingData] = useState(null);

  // Assessment form state
  const [gradeMemorization, setGradeMemorization] = useState(0); // 0 to 10
  const [gradeVersesCount, setGradeVersesCount] = useState(5); // Number of verses
  const [gradeBehavior, setGradeBehavior] = useState(0); // 0 to 5
  const [gradeAttendance, setGradeAttendance] = useState(0); // 0 to 10
  const [gradeActivity, setGradeActivity] = useState(0); // 0 to 10 (Admin exclusive)
  const [newHomeworkText, setNewHomeworkText] = useState('');

  // Database load status
  const [databaseLoaded, setDatabaseLoaded] = useState(false);

  // Profile Edit Form state
  const [profileName, setProfileName] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [profileWhatsapp, setProfileWhatsapp] = useState('');
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');

  // Toast State
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Creation / modification states for admins
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [editingAdminId, setEditingAdminId] = useState(null);

  const [newProduct, setNewProduct] = useState({ name: '', image: '', price: 0, stock: 0 });
  const [editingProductId, setEditingProductId] = useState(null);
  
  const [gradesSearchQuery, setGradesSearchQuery] = useState('');

  // Advanced Classroom Management States
  const [classroomAction, setClassroomAction] = useState(null); // null | 'add_student' | 'add_teacher' | 'add_classroom' | 'edit_student' | 'edit_teacher' | 'edit_classroom'
  const [studentFormName, setStudentFormName] = useState('');
  const [studentFormUsername, setStudentFormUsername] = useState('');
  const [studentFormPassword, setStudentFormPassword] = useState('');
  const [studentFormPhone, setStudentFormPhone] = useState('');
  const [studentFormClassId, setStudentFormClassId] = useState('');
  const [editingStudentObj, setEditingStudentObj] = useState(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentFilterClass, setStudentFilterClass] = useState('all');
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');
  const [teacherFilterGender, setTeacherFilterGender] = useState('all');

  const [teacherFormName, setTeacherFormName] = useState('');
  const [teacherFormPassword, setTeacherFormPassword] = useState('123');
  const [teacherFormWhatsapp, setTeacherFormWhatsapp] = useState('');
  const [teacherFormClassId, setTeacherFormClassId] = useState('');
  const [editingTeacherObj, setEditingTeacherObj] = useState(null);

  const [classFormName, setClassFormName] = useState('');
  const [classFormTeacherId, setClassFormTeacherId] = useState('');
  const [editingClassObj, setEditingClassObj] = useState(null);

  const [expandedClassId, setExpandedClassId] = useState(null);
  const [studentSearchForClass, setStudentSearchForClass] = useState('');

  // Teacher Homework Sub-Tab and form states
  const [teacherSubTab, setTeacherSubTab] = useState('roster'); // 'roster' | 'homework'
  const [collectiveHomeworkText, setCollectiveHomeworkText] = useState('');
  const [individualHomeworkTexts, setIndividualHomeworkTexts] = useState({}); // studentId -> tempText

  // AI Feature States & Methods
  const [studentAiMessages, setStudentAiMessages] = useState([
    { sender: 'ai', text: 'أهلاً بك يا بطل! 🤖 أنا المساعد الذكي لمنصة بنيان. كيف يمكنني مساعدتك اليوم في رحلتك القرآنية؟' }
  ]);
  const [studentAiInput, setStudentAiInput] = useState('');
  const [studentAiSelectedImage, setStudentAiSelectedImage] = useState('');
  const [isStudentAiTyping, setIsStudentAiTyping] = useState(false);
  const [isAdminSidebarOpen, setIsAdminSidebarOpen] = useState(false);


  const [teacherAiOutput, setTeacherAiOutput] = useState('');
  const [isTeacherAiLoading, setIsTeacherAiLoading] = useState(false);
  const [aiSelectedSurah, setAiSelectedSurah] = useState('سورة النبأ');
  const [aiQuestionCount, setAiQuestionCount] = useState(5);
  const [aiStudentName, setAiStudentName] = useState('');
  const [aiStudentPoints, setAiStudentPoints] = useState('');

  // 20 requests per user limit state
  const [aiUsage, setAiUsage] = useState(() => JSON.parse(localStorage.getItem('bonyan_ai_usage')) || {});

  useEffect(() => {
    localStorage.setItem('bonyan_ai_usage', JSON.stringify(aiUsage));
  }, [aiUsage]);

  const ensureArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.values(val);
  };

  const compressAndResizeImage = (file, maxWidth = 300, maxHeight = 300, quality = 0.7) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(reader.result);
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const saveUpdatesToFirebase = async ({
    students: nextStudents,
    classrooms: nextClassrooms,
    teachers: nextTeachers,
    admins: nextAdmins,
    storeProducts: nextStoreProducts,
    gradingHistory: nextGradingHistory,
    purchaseOrders: nextPurchaseOrders,
    aiUsage: nextAiUsage,
    lessons: nextLessons
  }) => {
    try {
      const updates = {};
      let hasUpdates = false;

      // 1. Compare students
      if (nextStudents !== undefined) {
        const arr = ensureArray(nextStudents);
        if (!prevStudentsRef.current || prevStudentsRef.current.length !== arr.length) {
          updates['/students'] = arr;
          hasUpdates = true;
        } else {
          arr.forEach((item, idx) => {
            if (JSON.stringify(item) !== JSON.stringify(prevStudentsRef.current[idx])) {
              updates[`/students/${idx}`] = item;
              hasUpdates = true;
            }
          });
        }
        prevStudentsRef.current = arr;
      }

      // 2. Compare classrooms
      if (nextClassrooms !== undefined) {
        const arr = ensureArray(nextClassrooms);
        if (!prevClassroomsRef.current || prevClassroomsRef.current.length !== arr.length) {
          updates['/classrooms'] = arr;
          hasUpdates = true;
        } else {
          arr.forEach((item, idx) => {
            if (JSON.stringify(item) !== JSON.stringify(prevClassroomsRef.current[idx])) {
              updates[`/classrooms/${idx}`] = item;
              hasUpdates = true;
            }
          });
        }
        prevClassroomsRef.current = arr;
      }

      // 3. Compare teachers
      if (nextTeachers !== undefined) {
        const arr = ensureArray(nextTeachers);
        if (!prevTeachersRef.current || prevTeachersRef.current.length !== arr.length) {
          updates['/teachers'] = arr;
          hasUpdates = true;
        } else {
          arr.forEach((item, idx) => {
            if (JSON.stringify(item) !== JSON.stringify(prevTeachersRef.current[idx])) {
              updates[`/teachers/${idx}`] = item;
              hasUpdates = true;
            }
          });
        }
        prevTeachersRef.current = arr;
      }

      // 4. Compare admins
      if (nextAdmins !== undefined) {
        const arr = ensureArray(nextAdmins);
        if (!prevAdminsRef.current || prevAdminsRef.current.length !== arr.length) {
          updates['/admins'] = arr;
          hasUpdates = true;
        } else {
          arr.forEach((item, idx) => {
            if (JSON.stringify(item) !== JSON.stringify(prevAdminsRef.current[idx])) {
              updates[`/admins/${idx}`] = item;
              hasUpdates = true;
            }
          });
        }
        prevAdminsRef.current = arr;
      }

      // 5. Compare storeProducts
      if (nextStoreProducts !== undefined) {
        const arr = ensureArray(nextStoreProducts);
        if (!prevStoreProductsRef.current || prevStoreProductsRef.current.length !== arr.length) {
          updates['/storeProducts'] = arr;
          hasUpdates = true;
        } else {
          arr.forEach((item, idx) => {
            if (JSON.stringify(item) !== JSON.stringify(prevStoreProductsRef.current[idx])) {
              updates[`/storeProducts/${idx}`] = item;
              hasUpdates = true;
            }
          });
        }
        prevStoreProductsRef.current = arr;
      }

      // 6. Compare gradingHistory
      if (nextGradingHistory !== undefined) {
        const arr = ensureArray(nextGradingHistory);
        if (!prevGradingHistoryRef.current || prevGradingHistoryRef.current.length !== arr.length) {
          updates['/gradingHistory'] = arr;
          hasUpdates = true;
        } else {
          arr.forEach((item, idx) => {
            if (JSON.stringify(item) !== JSON.stringify(prevGradingHistoryRef.current[idx])) {
              updates[`/gradingHistory/${idx}`] = item;
              hasUpdates = true;
            }
          });
        }
        prevGradingHistoryRef.current = arr;
      }

      // 7. Compare purchaseOrders
      if (nextPurchaseOrders !== undefined) {
        const arr = ensureArray(nextPurchaseOrders);
        if (!prevPurchaseOrdersRef.current || prevPurchaseOrdersRef.current.length !== arr.length) {
          updates['/purchaseOrders'] = arr;
          hasUpdates = true;
        } else {
          arr.forEach((item, idx) => {
            if (JSON.stringify(item) !== JSON.stringify(prevPurchaseOrdersRef.current[idx])) {
              updates[`/purchaseOrders/${idx}`] = item;
              hasUpdates = true;
            }
          });
        }
        prevPurchaseOrdersRef.current = arr;
      }

      // 8. Compare aiUsage
      if (nextAiUsage !== undefined) {
        if (JSON.stringify(nextAiUsage) !== JSON.stringify(prevAiUsageRef.current)) {
          updates['/aiUsage'] = nextAiUsage;
          hasUpdates = true;
        }
        prevAiUsageRef.current = nextAiUsage;
      }

      // 9. Compare lessons
      if (nextLessons !== undefined) {
        const arr = ensureArray(nextLessons);
        updates['/lessons'] = arr;
        hasUpdates = true;
      }
      if (hasUpdates) {
        await update(ref(db, '/'), updates);
        console.log('Successfully saved atomic updates to Firebase directly:', Object.keys(updates));
      }
    } catch (err) {
      console.error('Failed to save direct updates to Firebase:', err);
    }
  };

  const checkAndIncrementAiLimit = (userId) => {
    if (!userId) return false;
    const today = new Date().toLocaleDateString('en-US');
    const rawLimits = aiUsage[userId] || { count: 0, date: today };
    const userLimits = {
      count: rawLimits.date !== today ? 0 : rawLimits.count,
      date: today
    };

    if (userLimits.count >= 20) {
      triggerToast('عذراً! لقد استهلكت حدك اليومي المسموح به (20 استفساراً بالذكاء الاصطناعي).');
      return false;
    }

    // Increment usage
    const updated = {
      ...aiUsage,
      [userId]: { count: userLimits.count + 1, date: today }
    };
    setAiUsage(updated);
    return true;
  };


  const callGeminiApi = async (userPrompt, systemInstruction, imageBase64 = null) => {
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPrompt,
          systemInstruction,
          imageBase64
        })
      });

      const data = await response.json();

      if (response.status === 400 && data?.error?.includes('No API key')) {
        return '⚠️ لم يتم إعداد مفتاح الذكاء الاصطناعي بعد. يرجى من المشرف إضافة مفتاح Gemini API من صفحة الإعدادات.';
      }

      if (!response.ok) {
        const googleError = data?.error?.message || data?.error || 'خطأ غير معروف';
        console.error('Gemini API Error:', googleError);
        // If it's an invalid key error
        if (response.status === 400 || response.status === 403) {
          return `⚠️ مفتاح API غير صالح أو منتهي الصلاحية. يرجى من المشرف تحديث المفتاح من الإعدادات. (${response.status})`;
        }
        throw new Error(googleError);
      }

      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      } else {
        console.error('Gemini Proxy Error:', data);
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error(err);
      return 'عذراً، لم أتمكن من الاتصال بالذكاء الاصطناعي حالياً. يرجى التأكد من أن خادم الموقع متصل بنجاح.';
    }
  };


  // Auto version-check: polls server every 5 minutes and silently reloads if a new bundle is deployed
  useEffect(() => {
    let currentVersion = '';

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version?t=' + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        if (!data.version || data.version === 'unknown') return;
        if (!currentVersion) {
          currentVersion = data.version;
          return;
        }
        if (data.version !== currentVersion) {
          console.log('[Bonyan] New version detected, auto-reloading...');
          window.location.replace(window.location.href.split('?')[0] + '?v=' + Date.now());
        }
      } catch {
        // Silently ignore network errors
      }
    };

    // Check immediately, then every 5 minutes
    checkVersion();
    const interval = setInterval(checkVersion, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 1. Initial Cloud Database Load & Realtime Sync (Firebase Realtime Database)
  useEffect(() => {
    const dbRef = ref(db, '/');
    const unsubscribe = onValue(dbRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        
        const cloudStudents = ensureArray(data.students);
        const cloudClassrooms = ensureArray(data.classrooms);
        const cloudTeachers = ensureArray(data.teachers);
        const cloudAdmins = ensureArray(data.admins);
        const cloudStoreProducts = ensureArray(data.storeProducts);
        const cloudGradingHistory = ensureArray(data.gradingHistory).filter(item => item.id !== 'g1' && item.id !== 'g2');
        const cloudPurchaseOrders = ensureArray(data.purchaseOrders);

        // Mark this update as incoming from cloud to prevent echo write
        isIncomingCloudUpdate.current = true;
        
        if (data.students) setStudents(cloudStudents);
        if (data.classrooms) setClassrooms(cloudClassrooms);
        if (data.teachers) setTeachers(cloudTeachers);
        if (data.admins) setAdmins(cloudAdmins);
        setStoreProducts(cloudStoreProducts);
        setGradingHistory(cloudGradingHistory);
        setPurchaseOrders(cloudPurchaseOrders);
        if (data.aiUsage) setAiUsage(data.aiUsage);
        if (data.geminiApiKey) setGeminiApiKeyInput(data.geminiApiKey);

        // Update the refs with the incoming cloud values to prevent triggering save effect
        prevStudentsRef.current = cloudStudents;
        prevClassroomsRef.current = cloudClassrooms;
        prevTeachersRef.current = cloudTeachers;
        prevAdminsRef.current = cloudAdmins;
        prevStoreProductsRef.current = cloudStoreProducts;
        prevGradingHistoryRef.current = cloudGradingHistory;
        prevPurchaseOrdersRef.current = cloudPurchaseOrders;
        prevAiUsageRef.current = data.aiUsage || {};

        
        setDatabaseLoaded(true);
        console.log('Successfully synced database from Firebase Realtime Database.');
      } else {
        // If Firebase database is empty (does not exist), seed it with initial bonyanDatabase JSON data
        console.log('Firebase is empty. Seeding Firebase with initial database.');
        const seedData = {
          students: bonyanDatabase.students,
          classrooms: bonyanDatabase.classrooms,
          teachers: bonyanDatabase.teachers,
          admins: bonyanDatabase.admins || INITIAL_ADMINS,
          storeProducts: INITIAL_STORE,
          gradingHistory: [],
          purchaseOrders: [],
          aiUsage: {}
        };
        set(ref(db, '/'), seedData)
          .then(() => {
            console.log('Successfully seeded initial database to Firebase.');
            setDatabaseLoaded(true);
          })
          .catch((error) => {
            console.error('Failed to seed initial database to Firebase:', error);
          });
      }
    }, (error) => {
      console.error('Firebase read error:', error);
      setToastMessage('خطأ: فشل الاتصال بقاعدة بيانات Firebase!');
      setTimeout(() => setToastMessage(''), 3000);
    });

    return () => unsubscribe();
  }, []);

  // 2. Sync to localStorage
  useEffect(() => {
    // Only save to local storage if it's the correct imported data
    if (students && students.length >= 300) {
      localStorage.setItem('bonyan_students_v3', JSON.stringify(students));
      localStorage.setItem('bonyan_classrooms_v3', JSON.stringify(classrooms));
      localStorage.setItem('bonyan_teachers_v3', JSON.stringify(teachers));
      localStorage.setItem('bonyan_admins_v3', JSON.stringify(admins));
      localStorage.setItem('bonyan_store_v3', JSON.stringify(storeProducts));
      localStorage.setItem('bonyan_grading_history_v3', JSON.stringify(gradingHistory));
      localStorage.setItem('bonyan_orders_v3', JSON.stringify(purchaseOrders));
      localStorage.setItem('bonyan_logged_in_v3', JSON.stringify(isLoggedIn));
      localStorage.setItem('bonyan_current_user_v3', JSON.stringify(currentUser));
    }
  }, [students, classrooms, teachers, admins, storeProducts, gradingHistory, purchaseOrders, isLoggedIn, currentUser, aiUsage]);



  // Reset all grading inputs to defaults when switching/closing student selection to avoid carrying over grades
  useEffect(() => {
    setTimeout(() => {
      setGradeMemorization(0);
      setGradeVersesCount(5);
      setGradeBehavior(0);
      setGradeAttendance(0);
      setGradeActivity(0);
      setNewHomeworkText('');
    }, 0);
  }, [selectedStudentId]);

  // Pre-fill profile settings
  useEffect(() => {
    if (currentUser) {
      setTimeout(() => {
        setProfileName(currentUser.name);
        setProfilePassword(currentUser.password || '123');
        setProfileAvatar(currentUser.avatar || '');
        setProfileWhatsapp(currentUser.whatsapp || '');
      }, 0);
    }
  }, [studentTab, teacherTabState, adminTab, currentUser]);



  // Single Login Page Handler
  const handleLogin = (e) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      triggerToast('يرجى إدخال اسم المستخدم وكلمة المرور.');
      return;
    }

    const cleanUsername = loginUsername.replace(/\s+/g, '');
    const cleanPassword = loginPassword.replace(/\s+/g, '');

    // 1. Check Super Admin
    if ((cleanUsername === 'superadmin' || cleanUsername === 'المشرفالعام') && cleanPassword === '123') {
      const superAdminAcc = { id: 'sa1', name: 'المشرف العام للمنصة', email: 'superadmin@bonyan.com', role: 'superadmin', password: '123', avatar: '' };
      setCurrentUser(superAdminAcc);
      setIsLoggedIn(true);
      setAdminTab('store');
      triggerToast('مرحباً بالقائد المشرف العام');
      return;
    }

    // 1.5 Check Store Manager Account
    if (cleanUsername === 'store' && cleanPassword === 'store123') {
      const storeAcc = { id: 'store_m', name: 'مسؤول متجر الجوائز', role: 'store' };
      setCurrentUser(storeAcc);
      setIsLoggedIn(true);
      setAdminTab('store');
      triggerToast('مرحباً بمسؤول متجر الجوائز');
      return;
    }

    // 2. Check Admin
    const adminAcc = admins.find(a => 
      (a.email.replace(/\s+/g, '') === cleanUsername || a.name.replace(/\s+/g, '') === cleanUsername) && 
      a.password.replace(/\s+/g, '') === cleanPassword
    );
    if (adminAcc) {
      setCurrentUser({ ...adminAcc, role: 'admin' });
      setIsLoggedIn(true);
      setAdminTab('store');
      triggerToast(`مرحباً بالقائد المشرف ${adminAcc.name}`);
      return;
    }

    // 3. Check Teacher
    const teacherAcc = teachers.find(t => 
      (t.name.replace(/\s+/g, '') === cleanUsername || (t.username && t.username.replace(/\s+/g, '') === cleanUsername)) && 
      t.password.replace(/\s+/g, '') === cleanPassword
    );
    if (teacherAcc) {
      setCurrentUser({ ...teacherAcc, role: 'teacher' });
      setIsLoggedIn(true);
      setTeacherTabState('classroom');
      triggerToast(`مرحباً بالأستاذ الفاضل ${teacherAcc.name}`);
      return;
    }

    // 4. Check Student by full Arabic name or username
    const studentAcc = students.find(s => 
      (s.name.replace(/\s+/g, '') === cleanUsername || s.username.replace(/\s+/g, '') === cleanUsername) && 
      s.password.replace(/\s+/g, '') === cleanPassword
    );
    if (studentAcc) {
      setCurrentUser({ ...studentAcc, role: 'student' });
      setIsLoggedIn(true);
      setStudentTab('dashboard');
      triggerToast(`أهلاً بك يا ${studentAcc.name}`);
      return;
    }

    triggerToast('اسم المستخدم أو كلمة المرور غير صحيحة!');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setSelectedStudentId(null);
    setLoginUsername('');
    setLoginPassword('');
    triggerToast('تم تسجيل الخروج بنجاح.');
  };

  const handleSaveProfileSettings = (e) => {
    e.preventDefault();
    if (!profilePassword) return;

    if (currentUser.role === 'student') {
      const nextStudents = students.map(s => {
        if (s.id === currentUser.id) {
          const updated = { ...s, password: profilePassword, avatar: profileAvatar || s.avatar };
          setCurrentUser({ ...currentUser, ...updated });
          return updated;
        }
        return s;
      });
      setStudents(nextStudents);
      saveUpdatesToFirebase({ students: nextStudents });
    } else if (currentUser.role === 'teacher') {
      const nextTeachers = teachers.map(t => {
        if (t.id === currentUser.id) {
          const updated = { ...t, name: profileName, password: profilePassword, avatar: profileAvatar || t.avatar, whatsapp: profileWhatsapp };
          setCurrentUser({ ...currentUser, ...updated });
          return updated;
        }
        return t;
      });
      setTeachers(nextTeachers);
      saveUpdatesToFirebase({ teachers: nextTeachers });
    } else if (currentUser.role === 'admin') {
      const nextAdmins = admins.map(a => {
        if (a.id === currentUser.id) {
          const updated = { ...a, name: profileName, password: profilePassword, avatar: profileAvatar || a.avatar };
          setCurrentUser({ ...currentUser, ...updated });
          return updated;
        }
        return a;
      });
      setAdmins(nextAdmins);
      saveUpdatesToFirebase({ admins: nextAdmins });
    } else if (currentUser.role === 'superadmin') {
      setCurrentUser(prev => ({ ...prev, name: profileName, password: profilePassword, avatar: profileAvatar }));
    }

    triggerToast('تم حفظ تعديلات الملف الشخصي بنجاح!');
  };

  const handleSaveGeminiKey = async (e) => {
    e.preventDefault();
    if (!geminiApiKeyInput.trim()) {
      triggerToast('يرجى إدخال المفتاح أولاً!');
      return;
    }
    try {
      // 1. Write directly to Firebase Realtime Database
      await set(ref(db, '/geminiApiKey'), geminiApiKeyInput.trim());

      // 2. Notify the local express/http server memory cache
      await fetch('/api/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: geminiApiKeyInput.trim(), adminPassword: 'bonyan2025admin' })
      });
      
      triggerToast('✅ تم حفظ وتفعيل مفتاح الذكاء الاصطناعي بنجاح في قاعدة البيانات السحابية!');
    } catch (err) {
      console.error('Firebase save key error:', err);
      triggerToast('❌ فشل حفظ المفتاح في السحابة. يرجى التحقق من اتصال الإنترنت.');
    }
  };

  // Get Student Ranking
  const getStudentRanking = (studentId) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return { classroom: '0 / 0', course: '0 / 0' };

    const sortedCourse = [...students].sort((a, b) => b.totalPoints - a.totalPoints);
    const courseRank = sortedCourse.findIndex(s => s.id === studentId) + 1;

    const classStudents = students.filter(s => s.classroomId === student.classroomId);
    const sortedClass = [...classStudents].sort((a, b) => b.totalPoints - a.totalPoints);
    const classRank = sortedClass.findIndex(s => s.id === studentId) + 1;

    return {
      classroom: `${classRank} / ${classStudents.length}`,
      course: `${courseRank} / ${students.length}`
    };
  };

  // Student buy product
  const handlePurchase = (product) => {
    if (!currentUser || currentUser.role !== 'student') return;

    const studentData = students.find(s => s.id === currentUser.id);
    if (!studentData) return;

    if (studentData.availablePoints < product.price) {
      triggerToast('عذراً! نقاطك المتاحة غير كافية للشراء.');
      return;
    }
    if (product.stock <= 0) {
      triggerToast('عذراً! نفدت الكمية المتوفرة من هذا المنتج.');
      return;
    }

    const nextStudents = students.map(s => {
      if (s.id === studentData.id) {
        return { ...s, availablePoints: (Number(s.availablePoints) || 0) - product.price };
      }
      return s;
    });

    const nextStoreProducts = storeProducts.map(p => {
      if (p.id === product.id) {
        return { ...p, stock: (Number(p.stock) || 0) - 1 };
      }
      return p;
    });

    const newOrder = {
      id: generateUniqueId('o'),
      studentId: studentData.id,
      studentName: studentData.name,
      productName: product.name,
      price: product.price,
      date: new Date().toLocaleDateString('ar-EG'),
      status: 'pending'
    };
    const nextPurchaseOrders = [newOrder, ...purchaseOrders];

    setStudents(nextStudents);
    setStoreProducts(nextStoreProducts);
    setPurchaseOrders(nextPurchaseOrders);

    saveUpdatesToFirebase({
      students: nextStudents,
      storeProducts: nextStoreProducts,
      purchaseOrders: nextPurchaseOrders
    });

    triggerToast(`تم إتمام عملية شراء ${product.name} بنجاح! بانتظار استلامها من المعلم.`);
  };



  // Assessment / Grading Submit
  const handleTeacherSubmitGrades = () => {
    if (!selectedStudentId) return;

    // Check if student has their membership suspended/frozen
    const studentObj = students.find(s => s.id === selectedStudentId);
    if (studentObj && studentObj.isSuspended) {
      triggerToast('عذراً! عضوية هذا الطالب معلقة حالياً، ولا يمكن رصد درجات له.');
      return;
    }

    // Check if already graded today
    const todayIso = getLocalDateString();
    const todayAr = new Date().toLocaleDateString('ar-EG', { weekday: 'long', month: 'numeric', day: 'numeric' });
    const todayEn = new Date().toLocaleDateString('en-US');
    const alreadyGraded = gradingHistory.some(h => 
      h.studentId === selectedStudentId && 
      (h.isoDate === todayIso || h.date === todayAr || h.date === todayEn)
    );

    if (alreadyGraded) {
      // Admin/superadmin can override the daily restriction
      if (currentUser.role === 'admin' || currentUser.role === 'superadmin') {
        // Allow admin to proceed — just warn them
        triggerToast('⚠️ تنبيه: هذا الطالب تم تقييمه اليوم بالفعل، لكن الإدارة تملك صلاحية التقييم مجدداً.');
        // Don't return — let them proceed
      } else {
        triggerToast('عذراً! تم رصد درجات لهذا الطالب اليوم بالفعل. لا يمكن إضافة أكثر من درجة خلال اليوم الواحد.');
        return;
      }
    }

    // Calculate Memorization Points = درجة الحفظ مباشرة
    const rawMemorizationPoints = Number(gradeMemorization) || 0;
    const memorizationPoints = rawMemorizationPoints;

    const total = memorizationPoints + Number(gradeBehavior) + Number(gradeAttendance) + (currentUser.role === 'teacher' ? 0 : Number(gradeActivity));

    setCurrentGradingData({
      memorization: gradeMemorization,
      versesCount: gradeVersesCount,
      memorizationCalculated: memorizationPoints,
      behavior: gradeBehavior,
      attendance: gradeAttendance,
      activity: currentUser.role === 'teacher' ? 0 : gradeActivity,
      total: total
    });
    setShowGradingPopup(true);
  };

  const confirmGrades = () => {
    if (!selectedStudentId || !currentGradingData) return;

    const student = students.find(s => s.id === selectedStudentId);
    if (!student) return;

    const finalHomework = newHomeworkText || student.homework;

    const nextStudents = students.map(s => {
      if (s.id === selectedStudentId) {
        return {
          ...s,
          totalPoints: Math.round(((Number(s.totalPoints) || 0) + currentGradingData.total) * 10) / 10,
          availablePoints: Math.round(((Number(s.availablePoints) || 0) + currentGradingData.total) * 10) / 10,
          homework: finalHomework
        };
      }
      return s;
    });

    const nextClassrooms = classrooms.map(c => {
      if (c.id === student.classroomId) {
        return { ...c, totalPoints: Math.round(((Number(c.totalPoints) || 0) + currentGradingData.total) * 10) / 10 };
      }
      return c;
    });

    const historyItem = {
      id: generateUniqueId('g'),
      studentId: selectedStudentId,
      isoDate: getLocalDateString(),
      date: new Date().toLocaleDateString('ar-EG', { weekday: 'long', month: 'numeric', day: 'numeric' }),
      homework: finalHomework,
      grades: {
        memorization: currentGradingData.memorization,
        versesCount: currentGradingData.versesCount,
        behavior: currentGradingData.behavior,
        attendance: currentGradingData.attendance,
        activity: currentGradingData.activity
      }
    };
    const nextGradingHistory = [historyItem, ...gradingHistory];

    setStudents(nextStudents);
    setClassrooms(nextClassrooms);
    setGradingHistory(nextGradingHistory);

    saveUpdatesToFirebase({
      students: nextStudents,
      classrooms: nextClassrooms,
      gradingHistory: nextGradingHistory
    });

    setShowGradingPopup(false);
    triggerToast('تم رصد وتقييم الطالب بنجاح وتحديث نقاطه!');
    setSelectedStudentId(null);

    setGradeMemorization(0);
    setGradeVersesCount(5);
    setGradeBehavior(0);
    setGradeAttendance(0);
    setGradeActivity(0);
    setNewHomeworkText('');
  };

  // Super Admin: Admin accounts
  const handleSaveAdminAccount = (e) => {
    e.preventDefault();
    if (!newAdminName || !newAdminEmail || !newAdminPassword) return;

    let nextAdmins = [...admins];

    if (editingAdminId) {
      nextAdmins = admins.map(a => {
        if (a.id === editingAdminId) {
          return { ...a, name: newAdminName, email: newAdminEmail, password: newAdminPassword };
        }
        return a;
      });
      setAdmins(nextAdmins);
      saveUpdatesToFirebase({ admins: nextAdmins });
      setEditingAdminId(null);
      triggerToast('تم تحديث حساب المشرف');
    } else {
      const newAdmin = {
        id: generateUniqueId('a'),
        name: newAdminName,
        email: newAdminEmail,
        password: newAdminPassword
      };
      nextAdmins.push(newAdmin);
      setAdmins(nextAdmins);
      saveUpdatesToFirebase({ admins: nextAdmins });
      triggerToast('تم إضافة المشرف بنجاح');
    }

    setNewAdminName('');
    setNewAdminEmail('');
    setNewAdminPassword('');
  };

  const startEditAdmin = (admin) => {
    setEditingAdminId(admin.id);
    setNewAdminName(admin.name);
    setNewAdminEmail(admin.email);
    setNewAdminPassword(admin.password);
  };

  const deleteAdminAccount = (id) => {
    const nextAdmins = admins.filter(a => a.id !== id);
    setAdmins(nextAdmins);
    saveUpdatesToFirebase({ admins: nextAdmins });
    triggerToast('تم حذف حساب الآدمن');
  };

  const handleDeleteClassroomTeacher = (classId) => {
    const teacher = teachers.find(t => t.classroomId === classId);
    if (!teacher) return;

    const nextTeachers = teachers.filter(t => t.id !== teacher.id);
    const nextClassrooms = classrooms.map(c => {
      if (c.id === classId) {
        return { ...c, teacherId: '' };
      }
      return c;
    });

    setTeachers(nextTeachers);
    setClassrooms(nextClassrooms);
    saveUpdatesToFirebase({ teachers: nextTeachers, classrooms: nextClassrooms });

    triggerToast('تم حذف حساب المعلم وإلغاء تعيينه من الحلقة');
  };

  // Advanced Classroom Management Handlers
  const handleSaveStudentForm = (e) => {
    e.preventDefault();
    if (!studentFormName || !studentFormUsername || !studentFormPassword) {
      triggerToast('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    let nextStudents = [...students];

    if (editingStudentObj) {
      nextStudents = students.map(s => {
        if (s.id === editingStudentObj.id) {
          return {
            ...s,
            name: studentFormName,
            username: studentFormUsername,
            password: studentFormPassword,
            classroomId: studentFormClassId,
            phone: studentFormPhone
          };
        }
        return s;
      });
      setStudents(nextStudents);
      saveUpdatesToFirebase({ students: nextStudents });
      triggerToast('تم تعديل بيانات الطالب بنجاح');
    } else {
      const usernameExists = students.some(s => s.username === studentFormUsername);
      if (usernameExists) {
        triggerToast('خطأ: اسم المستخدم موجود بالفعل!');
        return;
      }
      const newStudent = {
        id: generateUniqueId('s'),
        name: studentFormName,
        username: studentFormUsername,
        password: studentFormPassword,
        classroomId: studentFormClassId || '',
        phone: studentFormPhone || '',
        totalPoints: 0,
        availablePoints: 0,
        avatar: '',
        homework: 'لم يحدد واجب بعد',
        isSuspended: false
      };
      nextStudents.push(newStudent);
      setStudents(nextStudents);
      saveUpdatesToFirebase({ students: nextStudents });
      triggerToast('تم إضافة الطالب الجديد بنجاح');
    }

    setStudentFormName('');
    setStudentFormUsername('');
    setStudentFormPassword('');
    setStudentFormPhone('');
    setStudentFormClassId('');
    setEditingStudentObj(null);
    setClassroomAction(null);
  };

  const handleSaveTeacherForm = (e) => {
    e.preventDefault();
    if (!teacherFormName || !teacherFormPassword) {
      triggerToast('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    let nextTeachers = [...teachers];
    let nextClassrooms = [...classrooms];

    if (editingTeacherObj) {
      nextTeachers = teachers.map(t => {
        if (t.id === editingTeacherObj.id) {
          return {
            ...t,
            name: teacherFormName,
            password: teacherFormPassword,
            whatsapp: teacherFormWhatsapp,
            classroomId: teacherFormClassId
          };
        }
        return t;
      });
      if (teacherFormClassId) {
        nextClassrooms = classrooms.map(c => {
          if (c.id === teacherFormClassId) {
            return { ...c, teacherId: editingTeacherObj.id };
          }
          if (c.teacherId === editingTeacherObj.id && c.id !== teacherFormClassId) {
            return { ...c, teacherId: '' };
          }
          return c;
        });
      } else {
        nextClassrooms = classrooms.map(c => {
          if (c.teacherId === editingTeacherObj.id) {
            return { ...c, teacherId: '' };
          }
          return c;
        });
      }
      setTeachers(nextTeachers);
      setClassrooms(nextClassrooms);
      saveUpdatesToFirebase({ teachers: nextTeachers, classrooms: nextClassrooms });
      triggerToast('تم تعديل بيانات المعلم بنجاح');
    } else {
      const newTId = generateUniqueId('t');
      const cleanName = teacherFormName.trim();
      const generatedUsername = `teacher.${generateTeacherUsernameSuffix()}`;
      const newTeacher = {
        id: newTId,
        name: cleanName,
        username: generatedUsername,
        password: teacherFormPassword,
        whatsapp: teacherFormWhatsapp || 'لا يوجد رقم مسجل',
        classroomId: teacherFormClassId || ''
      };
      nextTeachers.push(newTeacher);
      if (teacherFormClassId) {
        nextClassrooms = classrooms.map(c => {
          if (c.id === teacherFormClassId) {
            return { ...c, teacherId: newTId };
          }
          return c;
        });
      }
      setTeachers(nextTeachers);
      setClassrooms(nextClassrooms);
      saveUpdatesToFirebase({ teachers: nextTeachers, classrooms: nextClassrooms });
      triggerToast('تم إضافة المعلم الجديد بنجاح! اسم المستخدم: ' + generatedUsername);
    }

    setTeacherFormName('');
    setTeacherFormPassword('123');
    setTeacherFormWhatsapp('');
    setTeacherFormClassId('');
    setEditingTeacherObj(null);
    setClassroomAction(null);
  };

  const handleDeleteTeacher = (id) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المعلم نهائياً؟ سيتم إلغاء إسناد حلقته أيضاً.')) {
      const nextTeachers = teachers.filter(t => t.id !== id);
      const nextClassrooms = classrooms.map(c => {
        if (c.teacherId === id) {
          return { ...c, teacherId: '' };
        }
        return c;
      });
      setTeachers(nextTeachers);
      setClassrooms(nextClassrooms);
      saveUpdatesToFirebase({ teachers: nextTeachers, classrooms: nextClassrooms });
      triggerToast('تم حذف المعلم بنجاح');
    }
  };

  const handleSaveClassroomForm = (e) => {
    e.preventDefault();
    if (!classFormName) {
      triggerToast('يرجى إدخال اسم الحلقة');
      return;
    }

    let nextClassrooms = [...classrooms];
    let nextTeachers = [...teachers];

    if (editingClassObj) {
      nextClassrooms = classrooms.map(c => {
        if (c.id === editingClassObj.id) {
          return {
            ...c,
            name: classFormName,
            teacherId: classFormTeacherId
          };
        }
        return c;
      });
      if (classFormTeacherId) {
        nextTeachers = teachers.map(t => {
          if (t.id === classFormTeacherId) {
            return { ...t, classroomId: editingClassObj.id };
          }
          if (t.classroomId === editingClassObj.id && t.id !== classFormTeacherId) {
            return { ...t, classroomId: '' };
          }
          return t;
        });
      }
      setClassrooms(nextClassrooms);
      setTeachers(nextTeachers);
      saveUpdatesToFirebase({ classrooms: nextClassrooms, teachers: nextTeachers });
      triggerToast('تم تعديل بيانات الحلقة بنجاح');
    } else {
      const newCId = generateUniqueId('c');
      const newClass = {
        id: newCId,
        name: classFormName,
        teacherId: classFormTeacherId || '',
        totalPoints: 0
      };
      nextClassrooms.push(newClass);
      if (classFormTeacherId) {
        nextTeachers = teachers.map(t => {
          if (t.id === classFormTeacherId) {
            return { ...t, classroomId: newCId };
          }
          return t;
        });
      }
      setClassrooms(nextClassrooms);
      setTeachers(nextTeachers);
      saveUpdatesToFirebase({ classrooms: nextClassrooms, teachers: nextTeachers });
      triggerToast('تم إضافة الحلقة الجديدة بنجاح');
    }

    setClassFormName('');
    setClassFormTeacherId('');
    setEditingClassObj(null);
    setClassroomAction(null);
  };

  const handleDeleteStudent = (id) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الطالب نهائياً من المنصة؟')) {
      const nextStudents = students.filter(s => s.id !== id);
      setStudents(nextStudents);
      saveUpdatesToFirebase({ students: nextStudents });
      triggerToast('تم حذف الطالب بنجاح');
    }
  };

  const handleToggleSuspendStudent = (id) => {
    let nextStatus = false;
    const nextStudents = students.map(s => {
      if (s.id === id) {
        nextStatus = !s.isSuspended;
        return { ...s, isSuspended: nextStatus };
      }
      return s;
    });
    setStudents(nextStudents);
    saveUpdatesToFirebase({ students: nextStudents });
    triggerToast(nextStatus ? 'تم تعليق عضوية الطالب بنجاح' : 'تم تفعيل عضوية الطالب بنجاح');
  };

  const handleMoveStudent = (studentId, targetClassId) => {
    const nextStudents = students.map(s => {
      if (s.id === studentId) {
        return { ...s, classroomId: targetClassId };
      }
      return s;
    });
    setStudents(nextStudents);
    saveUpdatesToFirebase({ students: nextStudents });
    triggerToast('تم نقل الطالب إلى الحلقة المحددة بنجاح');
  };

  const handleDeleteClassroomObj = (classId) => {
    if (window.confirm('هل أنت متأكد من حذف هذه الحلقة نهائياً؟')) {
      const nextClassrooms = classrooms.filter(c => c.id !== classId);
      const nextTeachers = teachers.map(t => t.classroomId === classId ? { ...t, classroomId: '' } : t);
      const nextStudents = students.map(s => s.classroomId === classId ? { ...s, classroomId: '' } : s);
      
      setClassrooms(nextClassrooms);
      setTeachers(nextTeachers);
      setStudents(nextStudents);
      saveUpdatesToFirebase({ classrooms: nextClassrooms, teachers: nextTeachers, students: nextStudents });
      triggerToast('تم حذف الحلقة بنجاح');
    }
  };

  // Homework Assign Handlers (Collective & Individual)
  const handleAssignCollectiveHomework = (e) => {
    e.preventDefault();
    if (!teacherClassroom) {
      triggerToast('عذراً، لم يتم العثور على الحلقة المسندة إليك.');
      return;
    }
    if (!collectiveHomeworkText.trim()) {
      triggerToast('يرجى كتابة نص الواجب أولاً.');
      return;
    }

    const nextStudents = students.map(s => {
      if (s.classroomId === teacherClassroom.id) {
        return { ...s, homework: collectiveHomeworkText };
      }
      return s;
    });
    setStudents(nextStudents);
    saveUpdatesToFirebase({ students: nextStudents });

    triggerToast('تم إسناد الواجب لجميع طلاب الحلقة بنجاح!');
    setCollectiveHomeworkText('');
  };

  const handleAssignIndividualHomework = (studentId, homeworkText) => {
    if (!homeworkText.trim()) {
      triggerToast('يرجى إدخال نص الواجب للطالب.');
      return;
    }

    const nextStudents = students.map(s => {
      if (s.id === studentId) {
        return { ...s, homework: homeworkText };
      }
      return s;
    });
    setStudents(nextStudents);
    saveUpdatesToFirebase({ students: nextStudents });

    triggerToast('تم تحديث واجب الطالب بنجاح!');
  };

  // AI Feature Handlers
  const handleSendStudentAiMessage = async (customPrompt = null) => {
    if (!currentUser) return;
    const textToSend = customPrompt || studentAiInput;
    const imageToSend = customPrompt ? null : studentAiSelectedImage;
    if (!textToSend.trim() && !imageToSend) return;

    // Check query limit
    if (!checkAndIncrementAiLimit(currentUser.id)) {
      return;
    }

    const userMsg = { sender: 'user', text: textToSend, image: imageToSend };
    setStudentAiMessages(prev => [...prev, userMsg]);
    setStudentAiInput('');
    setStudentAiSelectedImage('');
    setIsStudentAiTyping(true);

    // Look up the teacher and classroom of the current student dynamically
    let teacherName = 'غير محدد';
    let teacherWhatsapp = 'غير محدد';
    if (currentUser.classroomId) {
      const cls = classrooms.find(c => c.id === currentUser.classroomId);
      if (cls && cls.teacherId) {
        const t = teachers.find(teach => teach.id === cls.teacherId);
        if (t) {
          teacherName = t.name;
          teacherWhatsapp = t.whatsapp || 'لا يوجد رقم مسجل';
        }
      }
    }

    const systemInstruction = `أنت معلم قرآن ذكي، لطيف ومحبب للأطفال في دورة 'بنيان' الصيفية بجامع فدائي الإسلام الأول.
معلومات معلم هذا الطالب الحالي: اسمه "${teacherName}"، ورقم الواتساب الخاص به للاتصال هو "${teacherWhatsapp}".
أجب دائماً باللغة العربية الفصحى بأسلوب مبسط جداً، مشجع ومناسب للأطفال بين 6 و 15 سنة.
اجعل إجاباتك مختصرة للغاية، بسيطة، ومباشرة وقصيرة قدر الإمكان (تجنب الإطالة أو التفصيل الزائد تماماً، واكتفِ بالإجابات البسيطة والقصيرة جداً).
تجنب استخدام الرموز التعبيرية (emojis) بكثرة، واجعلها مقتصرة فقط على الضرورة القصوى أو الحاجة الملحة لجذب الانتباه.
إذا أرسل الطالب صورة (مثل صورة مصحف، أو واجب مكتوب، أو صورة آيات) فتأملها جيداً وعلق عليها باختصار شديد ولطف باللغة العربية الفصحى.
إذا طلب الطالب قصة، احكِ له قصة قصيرة ومؤثرة جداً ومختصرة من قصص القرآن أو الأنبياء باللغة العربية الفصحى مع استخراج الفائدة التربوية منها باختصار شديد.
إذا طلب اختباراً، اطرح عليه سؤالاً واحداً فقط وبسيطاً جداً في جزء عم أو السور القصار وانتظر إجابته.

هام جداً: إذا سألك الطالب عن واجبه المحدد، أو أوقات دوامه وحضوره، أو أي سؤال تنظيمي يخص الحلقة ولا تعرف إجابته، فأخبره باختصار شديد ولطف أن يتواصل مع معلمه المختص "${teacherName}" مباشرة لمتابعة أمره، وأعطه رقم الواتساب الخاص بالمعلم وهو: "${teacherWhatsapp}".`;

    const aiResponse = await callGeminiApi(textToSend, systemInstruction, imageToSend);
    
    setStudentAiMessages(prev => [...prev, { sender: 'ai', text: aiResponse }]);
    setIsStudentAiTyping(false);
  };

  const handleTeacherGenerateQuiz = async () => {
    if (!currentUser) return;
    // Check limit
    if (!checkAndIncrementAiLimit(currentUser.id || currentUser.email)) {
      return;
    }

    setIsTeacherAiLoading(true);
    setTeacherAiOutput('');

    const systemInstruction = `أنت خبير تربوي ومساعد ذكي لمعلمي الحلقات القرآنية الصيفية في منصة بنيان بجامع فدائي الإسلام الأول. يجب أن تتحدث وتكتب باللغة العربية الفصحى المبسطة والراقية فقط، وتتجنب اللهجات العامية تماماً. ساعد المعلم في صياغة أسئلة اختبارات ذكية ومتقنة لقياس مستوى حفظ الطلاب وتجويدهم للسور المحددة.`;
    const prompt = `الرجاء إنشاء اختبار لـ ${aiSelectedSurah} يحتوي على ${aiQuestionCount} أسئلة متنوعة (مثال: أكمل الآية الكريمة، ما معنى الكلمة التالية، حدد الحكم التجويدي). اكتب الأسئلة بشكل واضح واحترافي باللغة العربية الفصحى فقط مع كتابة الإجابة النموذجية لكل سؤال بالأسفل لتسهيل التصحيح على المعلم.`;

    const response = await callGeminiApi(prompt, systemInstruction);
    setTeacherAiOutput(response);
    setIsTeacherAiLoading(false);
  };

  const handleTeacherGenerateEncouragement = async () => {
    if (!currentUser) return;
    if (!aiStudentName) {
      triggerToast('يرجى كتابة اسم الطالب أولاً!');
      return;
    }

    // Check limit
    if (!checkAndIncrementAiLimit(currentUser.id || currentUser.email)) {
      return;
    }

    setIsTeacherAiLoading(true);
    setTeacherAiOutput('');

    const systemInstruction = `أنت مساعد تربوي ذكي لمعلمي منصة بنيان. يجب أن تتحدث وتكتب باللغة العربية الفصحى المبسطة والراقية فقط وتتجنب اللهجات العامية تماماً. اكتب رسائل تشجيعية دافئة ومؤثرة تفيض بالمشاعر الأبوية والتقدير لتشجيع الطلاب في الحفظ والمواظبة.`;
    const prompt = `اكتب رسالة تشجيعية وتهنئة للطالب (أو الطالبة): ${aiStudentName} بمناسبة تفوقه وحصوله على مجموع نقاط قدره ${aiStudentPoints || 'نقاط ممتازة'} في الدورة الصيفية بجامع فدائي الإسلام الأول. اجعل الرسالة مكتوبة بلغة عربية فصيحة ومؤثرة جداً ومختصرة لترسل إلى ولي أمر الطالب أو تقرأ أمامه في المسجد لحثه على الاستمرار في الحفظ والتميز.`;

    const response = await callGeminiApi(prompt, systemInstruction);
    setTeacherAiOutput(response);
    setIsTeacherAiLoading(false);
  };


  // Admin Store products
  const handleSaveStoreProduct = (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price) return;

    let nextProducts = [...storeProducts];

    if (editingProductId) {
      nextProducts = storeProducts.map(p => {
        if (p.id === editingProductId) {
          return {
            ...p,
            name: newProduct.name,
            image: newProduct.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300',
            price: Number(newProduct.price),
            stock: Number(newProduct.stock)
          };
        }
        return p;
      });
      setStoreProducts(nextProducts);
      saveUpdatesToFirebase({ storeProducts: nextProducts });
      setEditingProductId(null);
      triggerToast('تم تحديث الهدية في المتجر');
    } else {
      const newP = {
        id: generateUniqueId('p'),
        name: newProduct.name,
        image: newProduct.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300',
        price: Number(newProduct.price),
        stock: Number(newProduct.stock)
      };
      nextProducts.push(newP);
      setStoreProducts(nextProducts);
      saveUpdatesToFirebase({ storeProducts: nextProducts });
      triggerToast('تم إضافة الهدية للمتجر');
    }

    setNewProduct({ name: '', image: '', price: 0, stock: 0 });
  };

  const scrollToAdminForm = () => {
    setTimeout(() => {
      const container = document.querySelector('.admin-panel-container') || document.querySelector('.admin-main-content');
      if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 50);
  };

  const startEditProduct = (product) => {
    setEditingProductId(product.id);
    setNewProduct({
      name: product.name,
      image: product.image,
      price: product.price,
      stock: product.stock
    });
    scrollToAdminForm();
  };

  const deleteStoreProduct = (id) => {
    const nextProducts = storeProducts.filter(p => p.id !== id);
    setStoreProducts(nextProducts);
    saveUpdatesToFirebase({ storeProducts: nextProducts });
    triggerToast('تم حذف الهدية من المتجر');
  };

  // CSV exporting
  const handleExportData = (type) => {
    let headers = [];
    let rows = [];
    let fileName = '';

    if (type === 'students') {
      headers = ['الرقم التعريفي', 'الاسم الكامل', 'اسم المستخدم', 'رمز الدخول (كلمة المرور)', 'رقم الهاتف', 'الرتبة القرآنية', 'مجموع النقاط التراكمي', 'النقاط المتاحة للاستبدال', 'الحلقة المسندة', 'حالة الحساب'];
      rows = students.map(s => {
        const cls = classrooms.find(c => c.id === s.classroomId);
        return [
          s.id, 
          s.name, 
          s.username || '', 
          s.password || '', 
          s.phone || 'غير مسجل', 
          getStudentRankName(s.totalPoints), 
          s.totalPoints || 0, 
          s.availablePoints || 0, 
          cls ? cls.name : 'بدون حلقة',
          s.isSuspended ? 'حساب معلق' : 'نشط'
        ];
      });
      fileName = 'Bonyan_Detailed_Students.csv';
    } else if (type === 'teachers') {
      headers = ['الرقم التعريفي', 'الاسم الكامل للمعلم', 'اسم المستخدم', 'رمز الدخول', 'رقم الواتساب', 'الحلقة المسندة', 'الجنس'];
      rows = teachers.map(t => {
        const cls = classrooms.find(c => c.id === t.classroomId || c.teacherId === t.id);
        const isFemale = t.gender === 'female' || (t.username && t.username.includes('.f.'));
        return [
          t.id, 
          t.name, 
          t.username || 'لم ينشأ بعد', 
          t.password || '', 
          t.whatsapp || 'لا يوجد', 
          cls ? cls.name : 'بدون حلقة',
          isFemale ? 'معلمة (إناث)' : 'معلم (ذكور)'
        ];
      });
      fileName = 'Bonyan_Detailed_Teachers.csv';
    } else if (type === 'classrooms') {
      headers = ['معرف الحلقة', 'اسم الحلقة', 'المعلم المسؤول', 'عدد الطلاب', 'إجمالي النقاط التراكمية في الحلقة'];
      rows = classrooms.map(c => {
        const teacher = teachers.find(t => t.classroomId === c.id || t.id === c.teacherId);
        const classStudents = students.filter(s => s.classroomId === c.id);
        const totalPoints = classStudents.reduce((sum, s) => sum + (s.totalPoints || 0), 0);
        return [
          c.id,
          c.name,
          teacher ? teacher.name : 'غير معين',
          classStudents.length,
          totalPoints
        ];
      });
      fileName = 'Bonyan_Detailed_Classrooms.csv';
    }

    let csvContent = "\uFEFF"; 
    csvContent += headers.join(",") + "\n";
    rows.forEach(r => {
      csvContent += r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const cleanFileName = fileName.replace(/\s+/g, '_');
    link.setAttribute("href", url);
    link.setAttribute("download", cleanFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast(`تم تحميل ملف التصدير بنجاح!`);
  };

  // Dynamic Teacher classroom retrieval
  const teacherClassroom = currentUser?.role === 'teacher' 
    ? (classrooms.find(c => c.teacherId === currentUser.id) || classrooms.find(c => c.id === currentUser.classroomId)) 
    : null;
  const teacherStudentsList = teacherClassroom ? students.filter(s => s.classroomId === teacherClassroom.id) : [];

  // Show premium loader if database is still synchronizing from Firebase
  if (!databaseLoaded) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontFamily: 'inherit',
        direction: 'rtl',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{
          width: '65px',
          height: '65px',
          border: '5px solid rgba(255,255,255,0.2)',
          borderTop: '5px solid #ffffff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '1.5rem'
        }}></div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <h2 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.5rem' }}>منصة بُنيان</h2>
        <p style={{ opacity: 0.9, fontSize: '0.95rem' }}>جاري مزامنة قاعدة البيانات والتحقق من أمان الاتصال...</p>
      </div>
    );
  }

  // Render Login page if not authenticated
  if (!isLoggedIn) {
    return (
      <div className="login-page-container p-1 d-flex flex-column align-center justify-between" style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)' }}>
        
        {/* Mosque Course Header Logo */}
        <div className="text-center mt-1 w-100" style={{ padding: '2rem 1rem 1rem 1rem' }}>
          <h2 style={{ color: 'var(--color-primary)', fontWeight: '800', fontSize: '2.2rem' }}>منصة بُنيان</h2>
          <p style={{ color: 'var(--color-text-gray)', fontSize: '0.95rem', marginTop: '0.2rem' }}>إدارة وتتبع الدورة الصيفية في جامع فدائي الإسلام الأول</p>
        </div>

        {/* Login Box Card */}
        <div className="login-card w-100" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '1.8rem', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--color-border)', maxWidth: '400px', margin: 'auto 0' }}>
          
          <h3 className="text-center mb-1" style={{ color: 'var(--color-primary)', fontWeight: '700' }}>تسجيل الدخول</h3>

          <form onSubmit={handleLogin}>
            <div className="admin-form-group">
              <label>اسم المستخدم (الاسم الثلاثي أو الرمز):</label>
              <input 
                type="text" 
                placeholder="مثال: سارة طالب ياسين أو sarah..." 
                className="admin-input" 
                value={loginUsername} 
                onChange={e => setLoginUsername(e.target.value)} 
                style={{ height: '45px', fontSize: '0.95rem' }}
                required 
              />
            </div>
            
            <div className="admin-form-group mt-1">
              <label>كلمة المرور:</label>
              <input 
                type="password" 
                placeholder="أدخل كلمة المرور الخاصة بك..." 
                className="admin-input" 
                value={loginPassword} 
                onChange={e => setLoginPassword(e.target.value)} 
                style={{ height: '45px', fontSize: '0.95rem' }}
                required 
              />
            </div>

            <button type="submit" className="submit-grades-btn" style={{ height: '46px', marginTop: '1.8rem' }}>
              تسجيل الدخول
            </button>
          </form>
        </div>

        {/* Footer info text */}
        <div className="text-center w-100" style={{ padding: '1.5rem 0', fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>
          منصة بُنيان لإدارة الأكاديمية والطلاب | 1447هـ
        </div>

        {/* Toast Notification */}
        {toastMessage && <div className="toast-msg">{toastMessage}</div>}
      </div>
    );
  }

  // Logged in student data
  const currentStudentData = currentUser?.role === 'student' ? students.find(s => s.id === currentUser.id) : null;

  const isWideLayout = ['admin', 'superadmin', 'teacher', 'store'].includes(currentUser.role);

  return (
    <div className={`App ${isWideLayout ? 'wide-layout' : ''}`}>
      
      {/* Top Banner (Removed) */}

      {/* App views matching the role logged in */}
      <div className="app-body-wrapper">
        
        {/* 1. STUDENT VIEW */}
        {currentUser.role === 'student' && currentStudentData && (
          <>
            {studentTab === 'dashboard' && (() => {
              const studentClassroom = classrooms.find(c => c.id === currentStudentData.classroomId);
              const classroomTeacher = studentClassroom ? teachers.find(t => t.classroomId === studentClassroom.id) : null;
              return (
                <div className="student-dashboard-view">
                  <header className="app-header">
                    {currentStudentData.avatar && (
                      <img src={currentStudentData.avatar} alt={currentStudentData.name} style={{ width: '75px', height: '75px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-primary)', marginBottom: '0.5rem' }} />
                    )}
                    <h1 className="student-name">{currentStudentData.name}</h1>
                    <div className="badge-ribbon">{getStudentRankName(currentStudentData.totalPoints)}</div>
                    
                    <div className="points-circle-container">
                      <div className="points-circle">
                        {currentStudentData.totalPoints}
                      </div>
                    </div>
                    <div className="points-circle-label">مجموع نقاطك التراكمية</div>
                    
                    <div className="points-available mt-1">
                      <span className="coin-icon"></span>
                      <span>الرصيد المتاح للشراء بالمتجر: {currentStudentData.availablePoints}</span>
                    </div>
                  </header>

                  <div className="stats-card-container">
                    <div className="stat-row">
                      <span>ترتيبك على الحلقة:</span>
                      <span className="stat-value">{getStudentRanking(currentStudentData.id).classroom}</span>
                    </div>
                    <div className="stat-row">
                      <span>ترتيبك على مستوى الدورة كاملاً:</span>
                      <span className="stat-value">{getStudentRanking(currentStudentData.id).course}</span>
                    </div>
                  </div>

                  {studentClassroom && (
                    <div className="homework-box" style={{ backgroundColor: '#ffffff', color: 'var(--color-text-dark)', border: '1px solid var(--color-border)', marginBottom: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                      <div className="homework-title" style={{ color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.4rem', marginBottom: '0.6rem' }}>🏢 تفاصيل الحلقة والمعلم</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'right', fontSize: '0.95rem' }}>
                        <div>
                          <span>اسم الحلقة: </span>
                          <strong>{studentClassroom.name}</strong>
                        </div>
                        {classroomTeacher && (
                          <>
                            <div>
                              <span>أستاذ الحلقة: </span>
                              <strong>{classroomTeacher.name}</strong>
                            </div>
                            {classroomTeacher.whatsapp && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem', borderTop: '1px dashed var(--color-border)', paddingTop: '0.4rem' }}>
                                <span>واتساب الأستاذ: <strong>{classroomTeacher.whatsapp}</strong></span>
                                <a 
                                  href={`https://wa.me/${classroomTeacher.whatsapp.replace(/\+/g, '').replace(/\s/g, '').replace(/-/g, '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  style={{ 
                                    backgroundColor: '#25D366', 
                                    color: '#ffffff', 
                                    padding: '0.3rem 0.8rem', 
                                    borderRadius: '6px', 
                                    textDecoration: 'none', 
                                    fontWeight: '700',
                                    fontSize: '0.85rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem'
                                  }}
                                >
                                  💬 مراسلة
                                </a>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="homework-box">
                    <div className="homework-title">واجب الدرس القادم المقرَّر</div>
                    <p>{currentStudentData.homework || 'لا يوجد واجبات حالياً.'}</p>
                  </div>
                </div>
              );
            })()}

            {studentTab === 'store' && (
              <div className="store-container">
                <div className="store-header">
                  <h2>متجر المكافآت والجوائز الصيفية</h2>
                  <div className="points-available mt-1">
                    <span className="coin-icon"></span>
                    <span>نقاطك المتاحة المتبقية: {currentStudentData.availablePoints}</span>
                  </div>
                </div>

                <div className="store-grid">
                  {storeProducts.map(product => (
                    <div key={product.id} className="product-card">
                      <img src={product.image} className="product-image" alt={product.name} />
                      <div className="product-title">{product.name}</div>
                      <div className="product-price">
                        <span className="coin-icon"></span>
                        <span>{product.price} نقطة</span>
                      </div>
                      <div className="product-stock">المخزن المتاح: {product.stock} قطع</div>
                      <button 
                        className="buy-btn"
                        disabled={product.stock <= 0 || currentStudentData.availablePoints < product.price}
                        onClick={() => handlePurchase(product)}
                      >
                        {product.stock <= 0 ? 'غير متوفر' : 'طلب شراء الجائزة'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {studentTab === 'profile' && (
              <div className="p-1">
                <div className="profile-card-modern">
                  <form onSubmit={handleSaveProfileSettings}>
                    <div className="avatar-upload-container">
                      <div className="avatar-preview-wrapper">
                        {profileAvatar ? (
                          <img src={profileAvatar} alt="Profile" />
                        ) : (
                          <span style={{ fontSize: '3rem' }}>👤</span>
                        )}
                      </div>
                      <label htmlFor="avatar-file-student" className="avatar-upload-overlay">
                        📷
                      </label>
                      <input 
                        id="avatar-file-student"
                        type="file" 
                        accept="image/*" 
                        className="avatar-file-input"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const res = await compressAndResizeImage(file, 200, 200, 0.7);
                            setProfileAvatar(res);
                          }
                        }} 
                      />
                    </div>

                    <h3 style={{ color: 'var(--color-primary)', fontWeight: '700', fontSize: '1.3rem', marginBottom: '1rem' }}>
                      {currentUser.name}
                    </h3>

                    <div className="profile-details-list">
                      <div className="profile-detail-item">
                        <span className="label">اسم المستخدم للدخول</span>
                        <span className="val">{currentUser.username}</span>
                      </div>
                      <div className="profile-detail-item">
                        <span className="label">الحلقة المسند إليها</span>
                        <span className="val">
                          {(() => {
                            const studentClass = classrooms.find(c => c.id === currentStudentData.classroomId);
                            return studentClass ? studentClass.name : 'غير محدد';
                          })()}
                        </span>
                      </div>
                      <div className="profile-detail-item">
                        <span className="label">الرتبة القرآنية التقديرية</span>
                        <span className="val" style={{ color: 'var(--color-primary-light)' }}>
                          {getStudentRankName(currentStudentData.totalPoints)}
                        </span>
                      </div>
                    </div>

                    <div className="admin-form-group mt-1" style={{ textAlign: 'right' }}>
                      <label>تغيير كلمة المرور الجديدة:</label>
                      <input 
                        type="password" 
                        className="admin-input" 
                        value={profilePassword} 
                        onChange={e => setProfilePassword(e.target.value)} 
                        required 
                      />
                    </div>

                    <button type="submit" className="modern-btn-primary">
                      💾 حفظ التغييرات والملف الشخصي
                    </button>
                    
                    <button type="button" onClick={handleLogout} className="modern-btn-logout">
                      🚪 تسجيل الخروج من الحساب
                    </button>
                  </form>
                </div>
              </div>
            )}

            {studentTab === 'lessons' && (() => {
              const mySessions = gradingHistory
                .filter(h => h.studentId === currentUser?.id)
                .sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));

              return (
                <div style={{ padding: '1rem 1rem 5rem 1rem' }}>
                  <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
                    <h2 style={{ color: 'var(--color-primary)', fontWeight: '700', fontSize: '1.2rem' }}>📚 سجل جلساتي</h2>
                    <p style={{ fontSize: '0.83rem', color: 'var(--color-text-gray)', marginTop: '0.3rem' }}>
                      جميع جلسات التحفيظ التي مررت بها مع معلمك
                    </p>
                  </div>
                  {mySessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-gray)', background: '#f9f9f9', borderRadius: '16px' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📭</div>
                      <p>لا توجد جلسات تقييم مسجلة بعد.</p>
                      <p style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>ستظهر هنا تلقائياً بعد كل جلسة تحفيظ.</p>
                    </div>
                  ) : (
                    mySessions.map(session => {
                      const total = session.grades
                        ? (Number(session.grades.memorization) || 0) +
                          (Number(session.grades.behavior) || 0) +
                          (Number(session.grades.attendance) || 0) +
                          (Number(session.grades.activity) || 0)
                        : 0;
                      return (
                        <div key={session.id} className="lesson-card">
                          <div className="lesson-card-header">
                            <span className="lesson-card-title">📅 {session.date || session.isoDate}</span>
                            <span style={{
                              background: total >= 15 ? '#e8f5e9' : total >= 10 ? '#fff8e1' : '#fce4ec',
                              color: total >= 15 ? '#2e7d32' : total >= 10 ? '#f57f17' : '#c62828',
                              borderRadius: '8px',
                              padding: '0.2rem 0.6rem',
                              fontWeight: '700',
                              fontSize: '0.85rem'
                            }}>
                              {total} / 20
                            </span>
                          </div>
                          {session.grades && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.5rem', direction: 'rtl' }}>
                              <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.82rem', textAlign: 'center' }}>
                                <div style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{session.grades.memorization}/10</div>
                                <div style={{ color: 'var(--color-text-gray)', fontSize: '0.75rem' }}>📖 التسميع</div>
                              </div>
                              <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.82rem', textAlign: 'center' }}>
                                <div style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{session.grades.behavior}/5</div>
                                <div style={{ color: 'var(--color-text-gray)', fontSize: '0.75rem' }}>📋 السلوك</div>
                              </div>
                              <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.82rem', textAlign: 'center' }}>
                                <div style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{session.grades.attendance}/5</div>
                                <div style={{ color: 'var(--color-text-gray)', fontSize: '0.75rem' }}>✅ الحضور</div>
                              </div>
                              {session.grades.versesCount > 0 && (
                                <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.82rem', textAlign: 'center' }}>
                                  <div style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{session.grades.versesCount}</div>
                                  <div style={{ color: 'var(--color-text-gray)', fontSize: '0.75rem' }}>🔢 آيات</div>
                                </div>
                              )}
                            </div>
                          )}
                          {session.homework && (
                            <div className="lesson-card-homework">
                              <strong>📝 الواجب: </strong>{session.homework}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })()}


            {studentTab === 'ai' && (
              <div className="ai-chat-container">
                <div className="ai-chat-header">
                  <span>🤖</span>
                  <span>مساعد بُنيان الذكي</span>
                </div>
                
                <div className="ai-chat-messages">
                  {studentAiMessages.map((msg, idx) => (
                    <div key={idx} className={`chat-bubble ${msg.sender}`}>
                      {msg.image && (
                        <img src={msg.image} alt="صورة مرفقة" />
                      )}
                      <div>{msg.text}</div>
                    </div>
                  ))}
                  {isStudentAiTyping && (
                    <div className="chat-bubble ai">
                      <div className="typing-indicator">
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="chat-suggestions">
                  <button className="chat-suggestion-btn" onClick={() => handleSendStudentAiMessage('ما هي قصة أصحاب الكهف؟')}>
                    📖 ما هي قصة أصحاب الكهف؟
                  </button>
                  <button className="chat-suggestion-btn" onClick={() => handleSendStudentAiMessage('ما معنى "والشمس وضحاها"؟')}>
                    💡 ما معنى "والشمس وضحاها"؟
                  </button>
                  <button className="chat-suggestion-btn" onClick={() => handleSendStudentAiMessage('اطرح علي سؤالاً في سورة النبأ ❓')}>
                    ❓ اطرح علي سؤالاً في سورة النبأ
                  </button>
                </div>

                {studentAiSelectedImage && (
                  <div className="image-preview-bar">
                    <div className="image-preview-thumbnail-container">
                      <img src={studentAiSelectedImage} className="image-preview-thumbnail" alt="معاينة" />
                      <button className="image-preview-remove-btn" onClick={() => setStudentAiSelectedImage('')}>✕</button>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>تم إرفاق صورة للذكاء الاصطناعي</span>
                  </div>
                )}

                <div className="ai-input-bar">
                  <input 
                    type="file" 
                    id="ai-image-upload" 
                    accept="image/*" 
                    style={{ display: 'none' }} 
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const res = await compressAndResizeImage(file, 400, 400, 0.7);
                        setStudentAiSelectedImage(res);
                      }
                      e.target.value = '';
                    }}
                  />
                  <button className="ai-chat-attach-btn" onClick={() => document.getElementById('ai-image-upload').click()} title="إرفاق صورة">
                    📷
                  </button>
                   <input 
                    type="text" 
                    className="ai-chat-input" 
                    placeholder="اكتب سؤالك هنا يا بطل..." 
                    value={studentAiInput}
                    onChange={e => setStudentAiInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSendStudentAiMessage(); }}
                  />
                  <button className="ai-chat-send-btn" onClick={() => handleSendStudentAiMessage()}>
                    ➔
                  </button>
                </div>
              </div>
            )}

            {/* Student Bottom Navigation bar */}
            {/* Student Bottom Navigation bar */}
            <nav className="bottom-nav">
              <button className={`nav-item ${studentTab === 'dashboard' ? 'active' : ''}`} onClick={() => setStudentTab('dashboard')}>
                <span className="nav-icon">👤</span>
                <span>الرئيسية</span>
              </button>
              <button className={`nav-item ${studentTab === 'store' ? 'active' : ''}`} onClick={() => setStudentTab('store')}>
                <span className="nav-icon">🛒</span>
                <span>المتجر</span>
              </button>
              <button className={`nav-item ${studentTab === 'lessons' ? 'active' : ''}`} onClick={() => setStudentTab('lessons')}>
                <span className="nav-icon">📖</span>
                <span>دروسي</span>
              </button>
              <button className={`nav-item ${studentTab === 'ai' ? 'active' : ''}`} onClick={() => setStudentTab('ai')}>
                <span className="nav-icon">🤖</span>
                <span>المساعد الذكي</span>
              </button>
              <button className={`nav-item ${studentTab === 'profile' ? 'active' : ''}`} onClick={() => setStudentTab('profile')}>
                <span className="nav-icon">⚙️</span>
                <span>الإعدادات</span>
              </button>
            </nav>
          </>
        )}

        {/* 2. TEACHER VIEW */}
        {currentUser.role === 'teacher' && (
          <div className="teacher-view-container">
            
            {/* Teacher Navigation */}
            <div className="admin-tabs" style={{ padding: '0.8rem 1.5rem 0 1.5rem', marginBottom: 0 }}>
              <button className={`admin-tab-btn ${teacherTabState === 'classroom' ? 'active' : ''}`} onClick={() => { setTeacherTabState('classroom'); setSelectedStudentId(null); }}>
                إدارة حلقة التحفيظ
              </button>
              <button className={`admin-tab-btn ${teacherTabState === 'lessons' ? 'active' : ''}`} onClick={() => setTeacherTabState('lessons')}>
                📖 سجل الدروس
              </button>
              <button className={`admin-tab-btn ${teacherTabState === 'profile' ? 'active' : ''}`} onClick={() => setTeacherTabState('profile')}>
                إعدادات الحساب الشخصي
              </button>
            </div>

            {/* Teacher Lessons Tab */}
            {teacherTabState === 'lessons' && (() => {
              // Get all students in this teacher's classroom
              const myStudentIds = teacherStudentsList.map(s => s.id);
              // Get all grading sessions for these students, sorted newest first
              const mySessions = gradingHistory
                .filter(h => myStudentIds.includes(h.studentId))
                .sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));

              // Group sessions by date
              const grouped = mySessions.reduce((acc, session) => {
                const key = session.date || session.isoDate || 'غير محدد';
                if (!acc[key]) acc[key] = [];
                acc[key].push(session);
                return acc;
              }, {});

              return (
                <div style={{ padding: '1rem 1.2rem' }}>
                  <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
                    <h3 style={{ color: 'var(--color-primary)', fontWeight: '700', marginBottom: '0.3rem' }}>
                      📖 سجل جلسات التحفيظ
                    </h3>
                    <p style={{ fontSize: '0.83rem', color: 'var(--color-text-gray)' }}>
                      يعرض هذا السجل جميع جلسات التقييم الفعلية التي أجريتها مع طلابك مرتبةً من الأحدث.
                    </p>
                  </div>

                  {mySessions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-gray)', background: '#f9f9f9', borderRadius: '16px' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📭</div>
                      <p>لا توجد جلسات تقييم مسجلة بعد.</p>
                      <p style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>ستظهر هنا تلقائياً عند تقييم طلابك.</p>
                    </div>
                  ) : (
                    Object.entries(grouped).map(([date, sessions]) => (
                      <div key={date} style={{ marginBottom: '1.5rem' }}>
                        <div style={{
                          background: 'var(--color-primary)',
                          color: '#fff',
                          padding: '0.4rem 1rem',
                          borderRadius: '8px',
                          fontWeight: '700',
                          fontSize: '0.85rem',
                          marginBottom: '0.6rem',
                          textAlign: 'right'
                        }}>
                          📅 {date}
                        </div>
                        {sessions.map(session => {
                          const student = students.find(s => s.id === session.studentId);
                          const total = session.grades
                            ? (Number(session.grades.memorization) || 0) +
                              (Number(session.grades.behavior) || 0) +
                              (Number(session.grades.attendance) || 0) +
                              (Number(session.grades.activity) || 0)
                            : 0;
                          return (
                            <div key={session.id} className="lesson-card" style={{ marginBottom: '0.6rem' }}>
                              <div className="lesson-card-header">
                                <span className="lesson-card-title">
                                  👤 {student ? student.name : 'طالب غير معروف'}
                                </span>
                                <span style={{
                                  background: total >= 15 ? '#e8f5e9' : total >= 10 ? '#fff8e1' : '#fce4ec',
                                  color: total >= 15 ? '#2e7d32' : total >= 10 ? '#f57f17' : '#c62828',
                                  borderRadius: '8px',
                                  padding: '0.2rem 0.6rem',
                                  fontWeight: '700',
                                  fontSize: '0.85rem'
                                }}>
                                  {total} / 20
                                </span>
                              </div>
                              {session.grades && (
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--color-text-gray)', marginBottom: '0.4rem', direction: 'rtl' }}>
                                  <span>📖 التسميع: {session.grades.memorization}/10</span>
                                  <span>•</span>
                                  <span>📋 السلوك: {session.grades.behavior}/5</span>
                                  <span>•</span>
                                  <span>✅ الحضور: {session.grades.attendance}/5</span>
                                  {session.grades.versesCount > 0 && (
                                    <><span>•</span><span>🔢 آيات: {session.grades.versesCount}</span></>
                                  )}
                                </div>
                              )}
                              {session.homework && (
                                <div className="lesson-card-homework">
                                  <strong>📝 الواجب: </strong>{session.homework}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              );
            })()}

            {teacherTabState === 'classroom' && selectedStudentId === null && (
              /* Classroom student list view */
              <div>
                <header className="teacher-header">
                  <h2>{teacherClassroom ? teacherClassroom.name : 'الحلقة المسندة'} (إدارة المعلم)</h2>
                  <div className="teacher-meta-item mt-1">
                    <span className="teacher-meta-icon">👤</span>
                    <span>أستاذ الحلقة: {currentUser.name}</span>
                  </div>
                  <div className="teacher-meta-item">
                    <span className="teacher-meta-icon">👥</span>
                    <span>طلاب الحلقة: {teacherStudentsList.length}</span>
                  </div>
                  <div className="teacher-meta-item">
                    <span className="teacher-meta-icon">⭐</span>
                    <span>إجمالي نقاط الحلقة التراكمية: {teacherClassroom ? teacherClassroom.totalPoints : 0} نقطة</span>
                  </div>
                </header>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem', padding: '0 1rem' }}>
                  <button 
                    className="admin-tab-btn" 
                    style={{ flex: 1, padding: '0.6rem', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: teacherSubTab === 'roster' ? 'var(--color-primary)' : '#ffffff', color: teacherSubTab === 'roster' ? '#ffffff' : 'var(--color-text-dark)', fontWeight: '700' }}
                    onClick={() => setTeacherSubTab('roster')}
                  >
                    📋 قائمة الطلاب ورصد التقييم
                  </button>
                  <button 
                    className="admin-tab-btn" 
                    style={{ flex: 1, padding: '0.6rem', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: teacherSubTab === 'homework' ? 'var(--color-primary)' : '#ffffff', color: teacherSubTab === 'homework' ? '#ffffff' : 'var(--color-text-dark)', fontWeight: '700' }}
                    onClick={() => setTeacherSubTab('homework')}
                  >
                    📖 تكليف الواجبات (فردي وجماعي)
                  </button>
                </div>

                {teacherSubTab === 'roster' && (
                  <div className="classroom-table-container">
                    <table className="classroom-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>الاسم الثلاثي للطالب</th>
                          <th>الرتبة الحالية</th>
                          <th>مجموع النقاط</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teacherStudentsList.map((student, idx) => (
                          <tr key={student.id} className="student-row" onClick={() => setSelectedStudentId(student.id)}>
                            <td>{idx + 1}</td>
                            <td>
                              <span className="status-dot green"></span>
                              {student.name}
                            </td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--color-primary-light)', fontWeight: '600' }}>
                              {getStudentRankName(student.totalPoints)}
                            </td>
                            <td style={{ fontWeight: '700' }}>{student.totalPoints}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {teacherSubTab === 'homework' && (
                  <div style={{ padding: '0 1rem', textAlign: 'right' }}>
                    
                    {/* Individual Homework Assignment Panel */}
                    <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '1.2rem', boxShadow: 'var(--shadow-sm)', marginBottom: '1.5rem' }}>
                      <h3 style={{ color: 'var(--color-primary)', fontWeight: '700', marginBottom: '0.8rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-start' }}>
                        <span>👤</span>
                        <span>تكليف الطلاب بشكل فردي (دروس مخصصة)</span>
                      </h3>
                      <p style={{ color: 'var(--color-text-gray)', fontSize: '0.8rem', marginBottom: '1.2rem' }}>
                        تعديل الواجب المخصص لكل طالب بشكل مستقل. اكتب النص بجانب اسم الطالب ثم اضغط تحديث.
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {teacherStudentsList.map(student => {
                          const tempText = individualHomeworkTexts[student.id] !== undefined ? individualHomeworkTexts[student.id] : (student.homework || '');
                          return (
                            <div key={student.id} style={{ border: '1px solid #eee', borderRadius: '8px', padding: '0.8rem', backgroundColor: '#fafafa' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                <strong>{student.name}</strong>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-primary-light)', fontWeight: '600' }}>
                                  {getStudentRankName(student.totalPoints)}
                                </span>
                              </div>
                              
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'stretch' }}>
                                <input 
                                  type="text" 
                                  className="admin-input" 
                                  style={{ height: '36px', fontSize: '0.85rem', margin: 0, flex: 1 }}
                                  value={tempText}
                                  placeholder="أدخل واجب الطالب هنا..."
                                  onChange={e => setIndividualHomeworkTexts(prev => ({ ...prev, [student.id]: e.target.value }))}
                                />
                                <button 
                                  className="buy-btn"
                                  style={{ margin: 0, padding: '0 0.8rem', fontSize: '0.8rem', backgroundColor: 'var(--color-primary)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  onClick={() => handleAssignIndividualHomework(student.id, tempText)}
                                >
                                  💾 تحديث
                                </button>
                              </div>

                              {/* Student Quick suggestion templates */}
                              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                                {['سورة النبأ كاملة', 'سورة الملك', 'واجب حفظ مخصص'].map(template => (
                                  <button 
                                    key={template}
                                    type="button" 
                                    style={{ fontSize: '0.7rem', border: '1px dashed #ccc', backgroundColor: '#ffffff', borderRadius: '4px', padding: '0.1rem 0.4rem', cursor: 'pointer', color: '#666' }}
                                    onClick={() => setIndividualHomeworkTexts(prev => ({ ...prev, [student.id]: template }))}
                                  >
                                    {template}
                                  </button>
                                ))}
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Collective Homework Assignment Panel */}
                    <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                      <h3 style={{ color: 'var(--color-primary)', fontWeight: '700', marginBottom: '0.8rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-start' }}>
                        <span>👥</span>
                        <span>تكليف الحلقة بالكامل (واجب جماعي موحد)</span>
                      </h3>
                      <p style={{ color: 'var(--color-text-gray)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                        اكتب نص الدرس أو الواجب بالأسفل لتطبيقه وتعميمه على جميع طلاب حلقة التحفيظ فوراً دفعة واحدة.
                      </p>
                      
                      <form onSubmit={handleAssignCollectiveHomework}>
                        <div className="admin-form-group">
                          <label>نص الواجب المشترك للحلقة:</label>
                          <textarea 
                            className="admin-input" 
                            style={{ height: '70px', padding: '0.5rem', resize: 'none' }} 
                            placeholder="مثال: مراجعة سورة النبأ وحفظ سورة النازعات من 1-15..."
                            value={collectiveHomeworkText}
                            onChange={e => setCollectiveHomeworkText(e.target.value)}
                            required
                          />
                        </div>

                        {/* Quick Template Buttons */}
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)', display: 'block', width: '100%' }}>💡 قوالب سريعة للتكليف:</span>
                          {['حفظ سورة الملك كاملة', 'مراجعة جزء عم كاملاً', 'حفظ جزء تبارك', 'تسميع سورة البقرة 1-50'].map(t => (
                            <button 
                              key={t}
                              type="button" 
                              className="chat-suggestion-btn" 
                              style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', margin: 0 }}
                              onClick={() => setCollectiveHomeworkText(t)}
                            >
                              {t}
                            </button>
                          ))}
                        </div>

                        <button type="submit" className="submit-grades-btn" style={{ margin: 0, height: '42px', width: '100%', fontSize: '0.95rem' }}>
                          📢 تعميم الواجب على جميع طلاب الحلقة
                        </button>
                      </form>
                    </div>

                  </div>
                )}
              </div>
            )}

            {teacherTabState === 'classroom' && selectedStudentId !== null && (
              /* Daily grading view for students */
              (() => {
                const s = students.find(x => x.id === selectedStudentId);
                const history = gradingHistory.filter(h => h.studentId === selectedStudentId);
                return (
                  <div>
                    <div className="student-profile-bar">
                      <button style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }} onClick={() => setSelectedStudentId(null)}>➔</button>
                      <img src={s.avatar || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23cccccc"><rect width="100%25" height="100%25" fill="%23f4f4f4"/><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'} alt={s.name} className="profile-avatar" />
                      <div className="profile-details">
                        <h3>{s.name}</h3>
                        <p>الرتبة القرآنية: {getStudentRankName(s.totalPoints)}</p>
                        <p style={{ fontWeight: '700', color: 'var(--color-primary)' }}>رصيد النقاط الكلي: {s.totalPoints}</p>
                      </div>
                    </div>

                    <div className="grading-section">
                      <div className="grading-title">رصد وتقييم الطالب اليومي</div>

                      {/* Last two sessions grades */}
                      <div className="last-sessions-grades" style={{ backgroundColor: '#f9f9f9', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.8rem', marginBottom: '1.2rem', textAlign: 'right' }}>
                        <div style={{ fontWeight: '700', color: 'var(--color-primary)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-start' }}>
                          <span>📅</span>
                          <span>درجات آخر درسين (اليومين السابقين):</span>
                        </div>
                        {history.slice(0, 2).length === 0 ? (
                          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-gray)' }}>لا توجد تقييمات سابقة لهذا الطالب بعد.</div>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {history.slice(0, 2).map((item, idx) => (
                              <div key={item.id} style={{ flex: '1 1 calc(50% - 0.25rem)', minWidth: '140px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.5rem', fontSize: '0.8rem' }}>
                                <div style={{ fontWeight: '700', borderBottom: '1px dashed var(--color-border)', paddingBottom: '0.2rem', marginBottom: '0.3rem', color: 'var(--color-primary-light)' }}>
                                  {idx === 0 ? 'الدرس الأخير' : 'الدرس قبل الأخير'} ({item.date})
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem' }}>
                                  <div>حفظ: <strong>{item.grades.memorization}</strong></div>
                                  <div>آيات: <strong>{item.grades.versesCount}</strong></div>
                                  <div>سلوك: <strong>{item.grades.behavior}</strong></div>
                                  <div>حضور: <strong>{item.grades.attendance}</strong></div>
                                </div>
                                <div style={{ marginTop: '0.3rem', fontWeight: '700', borderTop: '1px solid #eee', paddingTop: '0.2rem' }}>
                                  المجموع: {(item.grades.memorization * (item.grades.versesCount * 0.1) + item.grades.behavior + item.grades.attendance).toFixed(1)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Verses count input */}
                      <div className="grade-input-card">
                        <div className="grade-label"><span>🔢</span><span>عدد الآيات المحفوظة:</span></div>
                        <div className="grade-input-wrapper">
                          <input 
                            type="number" 
                            min="1" 
                            className="grade-number-input" 
                            value={gradeVersesCount} 
                            onChange={(e) => setGradeVersesCount(Math.max(1, Number(e.target.value)))} 
                          />
                          <span>آيات</span>
                        </div>
                      </div>

                      {/* Memorization points grade out of 20 */}
                      <div className="grade-input-card">
                        <div className="grade-label"><span>📖</span><span>درجة الحفظ والتجويد (من 20):</span></div>
                        <div className="grade-input-wrapper">
                          <input type="number" min="0" max="20" className="grade-number-input" value={gradeMemorization} onChange={(e) => setGradeMemorization(Math.min(20, Math.max(0, Number(e.target.value))))} />
                          <span>/ 20</span>
                        </div>
                      </div>

                      {/* Real-time Math helper banner */}
                      <div className="text-center mb-1" style={{ fontSize: '0.85rem', color: 'var(--color-primary-light)', padding: '0.4rem', backgroundColor: '#eef6f4', borderRadius: '6px', fontWeight: '700' }}>
                        مجموع النقاط المضافة اليوم: {gradeMemorization} (حفظ) + {gradeBehavior} (سلوك) + {gradeAttendance} (حضور) = {Number(gradeMemorization) + Number(gradeBehavior) + Number(gradeAttendance)} نقطة
                      </div>

                      <div className="grade-input-card">
                        <div className="grade-label"><span>⭐</span><span>درجة السلوك والأدب (من 5):</span></div>
                        <div className="grade-input-wrapper">
                          <input type="number" min="0" max="5" className="grade-number-input" value={gradeBehavior} onChange={(e) => setGradeBehavior(Math.min(5, Math.max(0, Number(e.target.value))))} />
                          <span>/ 5</span>
                        </div>
                      </div>

                      <div className="grade-input-card">
                        <div className="grade-label"><span>🚪</span><span>درجة حضور الدرس (من 10):</span></div>
                        <div className="grade-input-wrapper">
                          <input type="number" min="0" max="10" className="grade-number-input" value={gradeAttendance} onChange={(e) => setGradeAttendance(Math.min(10, Math.max(0, Number(e.target.value))))} />
                          <span>/ 10</span>
                        </div>
                      </div>

                      <div className="admin-form-group mt-1">
                        <label>تحديد واجب الدرس القادم للطالب:</label>
                        <textarea className="admin-input" style={{ height: '70px', padding: '0.5rem', resize: 'none' }} placeholder="اكتب تفاصيل تكليف الحفظ والمراجعة القادم..." value={newHomeworkText} onChange={(e) => setNewHomeworkText(e.target.value)} />
                      </div>

                      <button className="submit-grades-btn" onClick={handleTeacherSubmitGrades}>رفع الدرجات اليومية</button>
                    </div>

                    <div className="history-log-container">
                      <div className="history-title">سجل الدرجات السابقة للأيام الماضية</div>
                      <div className="history-scroll">
                        {history.length === 0 ? (
                          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-gray)' }}>لا يوجد تقييمات سابقة مسجلة لهذا الطالب.</p>
                        ) : (
                          history.map(item => (
                            <div key={item.id} className="history-card">
                              <div className="history-date">{item.date}</div>
                              <div className="history-item"><span>حفظ:</span><strong>{item.grades.memorization}</strong></div>
                              <div className="history-item"><span>آيات:</span><strong>{item.grades.versesCount}</strong></div>
                              <div className="history-item"><span>سلوك:</span><strong>{item.grades.behavior}</strong></div>
                              <div className="history-item"><span>حضور:</span><strong>{item.grades.attendance}</strong></div>
                              <div className="history-item" style={{ borderTop: '1px solid var(--color-border)', marginTop: '0.2rem', paddingTop: '0.2rem', fontWeight: '700' }}>
                                <span>المجموع:</span>
                                <span>{(item.grades.memorization * (item.grades.versesCount * 0.1) + item.grades.behavior + item.grades.attendance).toFixed(1)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}



            {/* Teacher tab: Profile Settings */}
            {teacherTabState === 'profile' && (
              <div className="p-1" style={{ maxWidth: '500px', margin: '0 auto' }}>
                <div className="profile-card-modern">
                  <h3 style={{ color: 'var(--color-primary)', fontWeight: '700', marginBottom: '1.5rem' }}>إعدادات حساب المعلم</h3>
                  <form onSubmit={handleSaveProfileSettings}>
                    <div className="avatar-upload-container">
                      <div className="avatar-preview-wrapper">
                        {profileAvatar ? (
                          <img src={profileAvatar} alt="Profile" />
                        ) : (
                          <span style={{ fontSize: '3rem' }}>👤</span>
                        )}
                      </div>
                      <label htmlFor="avatar-file-teacher" className="avatar-upload-overlay">
                        📷
                      </label>
                      <input 
                        id="avatar-file-teacher"
                        type="file" 
                        accept="image/*" 
                        className="avatar-file-input"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const res = await compressAndResizeImage(file, 200, 200, 0.7);
                            setProfileAvatar(res);
                          }
                        }} 
                      />
                    </div>

                    <div className="admin-form-group" style={{ textAlign: 'right' }}>
                      <label>الاسم الكامل المعلم/الأستاذ:</label>
                      <input type="text" className="admin-input" value={profileName} onChange={e => setProfileName(e.target.value)} required />
                    </div>

                    <div className="admin-form-group mt-1" style={{ textAlign: 'right' }}>
                      <label>رقم هاتف الأستاذ (واتساب):</label>
                      <input type="text" className="admin-input" placeholder="مثال: 9647701234567" value={profileWhatsapp} onChange={e => setProfileWhatsapp(e.target.value)} />
                    </div>

                    <div className="admin-form-group mt-1" style={{ textAlign: 'right' }}>
                      <label>تغيير كلمة المرور الجديدة:</label>
                      <input type="password" className="admin-input" value={profilePassword} onChange={e => setProfilePassword(e.target.value)} required />
                    </div>

                    <button type="submit" className="modern-btn-primary mt-1">
                      💾 حفظ التغييرات والملف
                    </button>
                    
                    <button type="button" onClick={handleLogout} className="modern-btn-logout">
                      🚪 تسجيل الخروج من الحساب
                    </button>
                  </form>
                </div>
              </div>
            )}

          </div>
        )}

        {/* 3. ADMIN / SUPER ADMIN VIEW */}
        {(currentUser.role === 'admin' || currentUser.role === 'superadmin' || currentUser.role === 'store') && (
          <div className="admin-layout-wrapper">
            
            {/* Desktop Sidebar */}
            <aside className="admin-desktop-sidebar">
              <div className="admin-sidebar-header">
                <h3>منصة بُنيان 🏢</h3>
                <span className="admin-role-badge">
                  {currentUser.role === 'superadmin' ? 'المشرف العام' : 'مشرف إداري'}
                </span>
              </div>
              <nav className="admin-sidebar-nav">
                {currentUser.role === 'superadmin' && (
                  <button className={`admin-sidebar-btn ${adminTab === 'admins' ? 'active' : ''}`} onClick={() => setAdminTab('admins')}>
                    <span>🔑 إدارة المشرفين</span>
                  </button>
                )}
                {(currentUser.role === 'superadmin' || currentUser.role === 'admin') && (
                  <>
                    <button className={`admin-sidebar-btn ${adminTab === 'grades' ? 'active' : ''}`} onClick={() => setAdminTab('grades')}>
                      <span>📈 رصد الدرجات</span>
                    </button>
                    <button className={`admin-sidebar-btn ${adminTab === 'classrooms' ? 'active' : ''}`} onClick={() => setAdminTab('classrooms')}>
                      <span>🏢 إدارة الحلقات</span>
                    </button>
                    <button className={`admin-sidebar-btn ${adminTab === 'students' ? 'active' : ''}`} onClick={() => setAdminTab('students')}>
                      <span>🎓 إدارة الطلاب</span>
                    </button>
                    <button className={`admin-sidebar-btn ${adminTab === 'teachers' ? 'active' : ''}`} onClick={() => setAdminTab('teachers')}>
                      <span>إدارة المعلمين</span>
                    </button>
                  </>
                )}
                {(currentUser.role === 'superadmin' || currentUser.role === 'admin' || currentUser.role === 'store') && (
                  <button className={`admin-sidebar-btn ${adminTab === 'store' ? 'active' : ''}`} onClick={() => setAdminTab('store')}>
                    <span>🎁 إدارة متجر الجوائز</span>
                    {purchaseOrders.filter(o => o.status === 'pending').length > 0 && (
                      <span className="sidebar-badge">{purchaseOrders.filter(o => o.status === 'pending').length}</span>
                    )}
                  </button>
                )}
                {(currentUser.role === 'superadmin' || currentUser.role === 'admin') && (
                  <button className={`admin-sidebar-btn ${adminTab === 'export' ? 'active' : ''}`} onClick={() => setAdminTab('export')}>
                    <span>📊 تصدير التقارير</span>
                  </button>
                )}
                <button className={`admin-sidebar-btn ${adminTab === 'profile' ? 'active' : ''}`} onClick={() => setAdminTab('profile')}>
                  <span>⚙️ إعدادات الحساب</span>
                </button>
              </nav>
              
              <div className="admin-sidebar-footer">
                <button onClick={handleLogout} className="sidebar-logout-btn">🚪 تسجيل الخروج</button>
              </div>
            </aside>

            {/* Mobile Sidebar Overlay (الصفحة الجانبية) */}
            {isAdminSidebarOpen && (
              <div className="admin-mobile-drawer-overlay" onClick={() => setIsAdminSidebarOpen(false)}>
                <div className="admin-mobile-drawer" onClick={e => e.stopPropagation()}>
                  <div className="drawer-header">
                    <h4 style={{ fontWeight: '700' }}>الخيارات الإضافية ⚙️</h4>
                    <button className="drawer-close-btn" onClick={() => setIsAdminSidebarOpen(false)}>✕</button>
                  </div>
                  <div className="drawer-menu">
                    {currentUser.role === 'superadmin' && (
                      <button className={`drawer-item-btn ${adminTab === 'admins' ? 'active' : ''}`} onClick={() => { setAdminTab('admins'); setIsAdminSidebarOpen(false); }}>
                        <span>🔑 إدارة المشرفين</span>
                      </button>
                    )}
                    {(currentUser.role === 'superadmin' || currentUser.role === 'admin') && (
                      <>
                        <button className={`drawer-item-btn ${adminTab === 'students' ? 'active' : ''}`} onClick={() => { setAdminTab('students'); setIsAdminSidebarOpen(false); }}>
                          <span>🎓 إدارة الطلاب</span>
                        </button>
                        <button className={`drawer-item-btn ${adminTab === 'teachers' ? 'active' : ''}`} onClick={() => { setAdminTab('teachers'); setIsAdminSidebarOpen(false); }}>
                          <span>إدارة المعلمين</span>
                        </button>
                        <button className={`drawer-item-btn ${adminTab === 'export' ? 'active' : ''}`} onClick={() => { setAdminTab('export'); setIsAdminSidebarOpen(false); }}>
                          <span>📊 تصدير التقارير</span>
                        </button>
                      </>
                    )}
                    <button className={`drawer-item-btn ${adminTab === 'profile' ? 'active' : ''}`} onClick={() => { setAdminTab('profile'); setIsAdminSidebarOpen(false); }}>
                      <span>⚙️ إعدادات الحساب</span>
                    </button>
                    <button onClick={() => { handleLogout(); setIsAdminSidebarOpen(false); }} className="drawer-item-btn text-danger" style={{ marginTop: '1.5rem', color: 'var(--color-error)' }}>
                      <span>🚪 تسجيل الخروج</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Main Content Pane */}
            <main className="admin-main-content">
              <header className="admin-mobile-header">
                <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--color-primary)' }}>منصة بُنيان</h2>
                <span className="admin-role-badge">
                  {currentUser.role === 'superadmin' ? 'المشرف العام' : 'مشرف إداري'}
                </span>
              </header>

              <div className="admin-panel-container">

            {/* TAB CONTENT: SUPER ADMIN - ADMIN ACCOUNTS */}
            {adminTab === 'admins' && currentUser.role === 'superadmin' && (
              <div>
                <h3>{editingAdminId ? 'تعديل حساب المشرف' : 'إضافة حساب مشرف (Admin) جديد'}</h3>
                <form onSubmit={handleSaveAdminAccount} className="mt-1">
                  <div className="admin-form-group">
                    <label>الاسم الكامل للمشرف:</label>
                    <input type="text" className="admin-input" value={newAdminName} onChange={e => setNewAdminName(e.target.value)} required />
                  </div>
                  <div className="admin-form-group">
                    <label>البريد الإلكتروني:</label>
                    <input type="email" className="admin-input" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} required />
                  </div>
                  <div className="admin-form-group">
                    <label>كلمة المرور:</label>
                    <input type="text" className="admin-input" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} required />
                  </div>
                  <div className="d-flex gap-05">
                    <button type="submit" className="admin-submit-btn w-100">{editingAdminId ? 'تعديل وحفظ التغييرات' : 'إضافة حساب المشرف'}</button>
                    {editingAdminId && (
                      <button 
                        type="button" 
                        className="admin-submit-btn w-100" 
                        style={{ backgroundColor: '#ccc', color: '#333' }}
                        onClick={() => {
                          setEditingAdminId(null);
                          setNewAdminName('');
                          setNewAdminEmail('');
                          setNewAdminPassword('');
                        }}
                      >
                        إلغاء التعديل
                      </button>
                    )}
                  </div>
                </form>

                <h3 className="mt-1">قائمة حسابات المشرفين الحالية</h3>
                <div className="mt-1">
                  {admins.map(admin => (
                    <div key={admin.id} className="admin-list-item">
                      <div>
                        <strong>{admin.name}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>{admin.email} (كلمة المرور: {admin.password})</div>
                      </div>
                      <div className="d-flex gap-05">
                        <button className="buy-btn" style={{ padding: '0.2rem 0.5rem', backgroundColor: '#f1c40f', color: '#333' }} onClick={() => startEditAdmin(admin)}>تعديل</button>
                        <button className="admin-delete-btn" onClick={() => deleteAdminAccount(admin.id)}>حذف</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}


            {/* TAB CONTENT: SEARCH / OVERRIDE GRADES & INTERACTIVE GRADING (ADMIN SIDE) */}
            {adminTab === 'grades' && (
              <div>
                {selectedStudentId === null ? (
                  <>
                    <h3>البحث ورصد درجات الطلاب (تحكم كامل للإدارة)</h3>
                    <input 
                      type="text" 
                      className="search-input mt-1" 
                      placeholder="اكتب اسم الطالب أو اسم المستخدم للبحث السريع..." 
                      value={gradesSearchQuery}
                      onChange={e => setGradesSearchQuery(e.target.value)}
                    />

                    <div className="mt-1">
                      {students.filter(s => s.name.includes(gradesSearchQuery) || s.username.includes(gradesSearchQuery)).map(student => {
                        const cls = classrooms.find(c => c.id === student.classroomId);
                        return (
                          <div key={student.id} className="admin-list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
                            <div className="d-flex justify-between w-100">
                              <div>
                                <strong>{student.name} ({student.username})</strong>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>
                                  الحلقة: {cls ? cls.name : 'غير محدد'} | الرتبة: {getStudentRankName(student.totalPoints)} | رمز الدخول: {student.password}
                                </div>
                              </div>
                              <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: '700', color: 'var(--color-primary)' }}>التراكمي: {student.totalPoints}</div>
                                <div style={{ fontSize: '0.8rem' }}>المتاح: {student.availablePoints}</div>
                              </div>
                            </div>
                            <div className="d-flex gap-05 w-100" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                              <button className="buy-btn w-100" style={{ padding: '0.3rem', backgroundColor: 'var(--color-primary-light)' }} onClick={() => setSelectedStudentId(student.id)}>
                                تقييم ورصد درجات الطالب (تفصيلي)
                              </button>
                              <button 
                                className="buy-btn w-100" 
                                style={{ padding: '0.3rem', backgroundColor: 'var(--color-accent)', color: '#333' }}
                                onClick={() => {
                                  const extraPoints = prompt(`أدخل عدد النقاط لإضافتها أو خصمها من رصيد ${student.name} (استخدم إشارة سالب للخصم):`, "50");
                                  if (extraPoints && !isNaN(Number(extraPoints))) {
                                    const pts = Number(extraPoints);
                                    const nextStudents = students.map(st => {
                                      if (st.id === student.id) {
                                        return { 
                                          ...st, 
                                          totalPoints: Math.round(Math.max(0, st.totalPoints + pts) * 10) / 10,
                                          availablePoints: Math.round(Math.max(0, st.availablePoints + pts) * 10) / 10
                                        };
                                      }
                                      return st;
                                    });
                                    setStudents(nextStudents);
                                    saveUpdatesToFirebase({ students: nextStudents });
                                    triggerToast('✅ تم تعديل النقاط وحفظها بنجاح!');
                                  }
                                }}
                              >
                                تعديل النقاط مباشرة
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  /* Admin detailed grading overlay */
                  (() => {
                    const s = students.find(x => x.id === selectedStudentId);
                    const history = gradingHistory.filter(h => h.studentId === selectedStudentId);
                    return (
                      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '1rem' }}>
                        <div className="d-flex justify-between align-center mb-1">
                          <h3>رصد درجات مخصص للآدمن: {s.name}</h3>
                          <button style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }} onClick={() => setSelectedStudentId(null)}>إغلاق ➔</button>
                        </div>

                        {/* Last two sessions grades */}
                        <div className="last-sessions-grades" style={{ backgroundColor: '#f9f9f9', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.8rem', marginBottom: '1.2rem', textAlign: 'right' }}>
                          <div style={{ fontWeight: '700', color: 'var(--color-primary)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-start' }}>
                            <span>📅</span>
                            <span>درجات آخر درسين (اليومين السابقين):</span>
                          </div>
                          {history.slice(0, 2).length === 0 ? (
                            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-gray)' }}>لا توجد تقييمات سابقة لهذا الطالب بعد.</div>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {history.slice(0, 2).map((item, idx) => (
                                <div key={item.id} style={{ flex: '1 1 calc(50% - 0.25rem)', minWidth: '140px', backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.5rem', fontSize: '0.8rem' }}>
                                  <div style={{ fontWeight: '700', borderBottom: '1px dashed var(--color-border)', paddingBottom: '0.2rem', marginBottom: '0.3rem', color: 'var(--color-primary-light)' }}>
                                    {idx === 0 ? 'الدرس الأخير' : 'الدرس قبل الأخير'} ({item.date})
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem' }}>
                                    <div>حفظ: <strong>{item.grades.memorization}</strong></div>
                                    <div>آيات: <strong>{item.grades.versesCount}</strong></div>
                                    <div>سلوك: <strong>{item.grades.behavior}</strong></div>
                                    <div>حضور: <strong>{item.grades.attendance}</strong></div>
                                  </div>
                                  <div style={{ marginTop: '0.3rem', fontWeight: '700', borderTop: '1px solid #eee', paddingTop: '0.2rem' }}>
                                    المجموع: {(item.grades.memorization * (item.grades.versesCount * 0.1) + item.grades.behavior + item.grades.attendance).toFixed(1)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="grade-input-card">
                          <span>عدد الآيات المحفوظة:</span>
                          <input type="number" className="grade-number-input" value={gradeVersesCount} onChange={e => setGradeVersesCount(Math.max(1, Number(e.target.value)))} />
                        </div>
                        <div className="grade-input-card">
                          <span>درجة الحفظ والتجويد (من 20):</span>
                          <input type="number" className="grade-number-input" value={gradeMemorization} onChange={e => setGradeMemorization(Math.min(20, Math.max(0, Number(e.target.value))))} />
                        </div>

                        {/* Math helper */}
                        <div className="text-center mb-1" style={{ fontSize: '0.85rem', color: 'var(--color-primary-light)', padding: '0.4rem', backgroundColor: '#eef6f4', borderRadius: '6px', fontWeight: '700' }}>
                          مجموع النقاط المضافة اليوم: {gradeMemorization} (حفظ) + {gradeBehavior} (سلوك) + {gradeAttendance} (حضور) {currentUser.role !== 'teacher' ? `+ ${gradeActivity} (نشاط) = ${Number(gradeMemorization) + Number(gradeBehavior) + Number(gradeAttendance) + Number(gradeActivity)}` : `= ${Number(gradeMemorization) + Number(gradeBehavior) + Number(gradeAttendance)}`} نقطة
                        </div>

                        <div className="grade-input-card">
                          <span>درجة السلوك والأدب (من 5):</span>
                          <input type="number" className="grade-number-input" value={gradeBehavior} onChange={e => setGradeBehavior(Math.min(5, Math.max(0, Number(e.target.value))))} />
                        </div>
                        <div className="grade-input-card">
                          <span>درجة الحضور والغياب (من 10):</span>
                          <input type="number" className="grade-number-input" value={gradeAttendance} onChange={e => setGradeAttendance(Math.min(10, Math.max(0, Number(e.target.value))))} />
                        </div>

                        {/* Admin Exclusive Activity input */}
                        <div className="grade-input-card" style={{ border: '1px solid var(--color-accent)' }}>
                          <span style={{ fontWeight: '700' }}>درجة... (من 10 - خاص بالإدارة فقط):</span>
                          <input type="number" className="grade-number-input" value={gradeActivity} onChange={e => setGradeActivity(Math.min(10, Math.max(0, Number(e.target.value))))} />
                        </div>

                        <div className="admin-form-group mt-1">
                          <label>تعديل واجب الدرس القادم:</label>
                          <textarea className="admin-input" style={{ height: '60px', padding: '0.5rem' }} value={newHomeworkText} onChange={e => setNewHomeworkText(e.target.value)} />
                        </div>

                        <button className="submit-grades-btn" onClick={handleTeacherSubmitGrades}>تأكيد وتقييم الطالب</button>
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {/* TAB CONTENT: CLASSROOMS & TEACHERS */}
            {adminTab === 'classrooms' && (
              <div>
                {expandedClassId === null ? (
                  /* 1. LIST VIEW OF ALL CLASSROOMS & QUICK CREATION */
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
                      <button 
                        className="buy-btn" 
                        style={{ margin: 0, padding: '0.7rem 1.2rem', flex: 1, minWidth: '130px', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '10px', transition: 'all 0.2s', border: '1px solid var(--color-border)', backgroundColor: classroomAction === 'add_student' ? 'var(--color-primary)' : '#f8fafc', color: classroomAction === 'add_student' ? '#ffffff' : 'var(--color-text-dark)', boxShadow: classroomAction === 'add_student' ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none' }} 
                        onClick={() => {
                          setClassroomAction('add_student');
                          setEditingStudentObj(null);
                          setStudentFormName('');
                          setStudentFormUsername('');
                          setStudentFormPassword('');
                          setStudentFormClassId('');
                        }}
                      >
                        👤 إضافة طالب جديد
                      </button>
                      <button 
                        className="buy-btn" 
                        style={{ margin: 0, padding: '0.7rem 1.2rem', flex: 1, minWidth: '130px', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '10px', transition: 'all 0.2s', border: '1px solid var(--color-border)', backgroundColor: classroomAction === 'add_teacher' ? 'var(--color-primary)' : '#f8fafc', color: classroomAction === 'add_teacher' ? '#ffffff' : 'var(--color-text-dark)', boxShadow: classroomAction === 'add_teacher' ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none' }} 
                        onClick={() => {
                          setClassroomAction('add_teacher');
                          setEditingTeacherObj(null);
                          setTeacherFormName('');
                          setTeacherFormPassword('123');
                          setTeacherFormWhatsapp('');
                          setTeacherFormClassId('');
                        }}
                      >
                        👨‍🏫 إضافة معلم جديد
                      </button>
                      <button 
                        className="buy-btn" 
                        style={{ margin: 0, padding: '0.7rem 1.2rem', flex: 1, minWidth: '130px', fontSize: '0.9rem', fontWeight: 'bold', borderRadius: '10px', transition: 'all 0.2s', border: '1px solid var(--color-border)', backgroundColor: classroomAction === 'add_classroom' ? 'var(--color-primary)' : '#f8fafc', color: classroomAction === 'add_classroom' ? '#ffffff' : 'var(--color-text-dark)', boxShadow: classroomAction === 'add_classroom' ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none' }} 
                        onClick={() => {
                          setClassroomAction('add_classroom');
                          setEditingClassObj(null);
                          setClassFormName('');
                          setClassFormTeacherId('');
                        }}
                      >
                        🏢 إضافة حلقة جديدة
                      </button>
                    </div>

                    {/* ADD/EDIT STUDENT FORM */}
                    {(classroomAction === 'add_student' || classroomAction === 'edit_student') && (
                      <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)', textAlign: 'right' }}>
                        <h4 style={{ color: 'var(--color-primary)', marginBottom: '0.8rem', fontWeight: '700' }}>
                          {classroomAction === 'edit_student' ? '✏️ تعديل بيانات الطالب: ' + (editingStudentObj?.name || '') : '👤 إضافة طالب جديد للمنصة'}
                        </h4>
                        <form onSubmit={handleSaveStudentForm}>
                          <div className="admin-form-group">
                            <label>الاسم الثلاثي للطالب:</label>
                            <input type="text" className="admin-input" value={studentFormName} onChange={e => setStudentFormName(e.target.value)} required />
                          </div>
                          <div className="admin-form-group">
                            <label>اسم المستخدم للدخول (بالإنجليزي):</label>
                            <input type="text" className="admin-input" placeholder="مثال: sarah" value={studentFormUsername} onChange={e => setStudentFormUsername(e.target.value)} required />
                          </div>
                          <div className="admin-form-group">
                            <label>كلمة المرور:</label>
                            <input type="text" className="admin-input" value={studentFormPassword} onChange={e => setStudentFormPassword(e.target.value)} required />
                          </div>
                          <div className="admin-form-group">
                            <label>تحديد الحلقة المسند إليها:</label>
                            <select className="admin-input" value={studentFormClassId} onChange={e => setStudentFormClassId(e.target.value)}>
                              <option value="">بدون حلقة (مستقل)</option>
                              {classrooms.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                            <button type="submit" className="admin-submit-btn w-100" style={{ margin: 0 }}>💾 حفظ البيانات</button>
                            <button type="button" className="admin-submit-btn w-100" style={{ backgroundColor: '#ccc', color: '#333', margin: 0 }} onClick={() => setClassroomAction(null)}>إلغاء</button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* ADD/EDIT TEACHER FORM */}
                    {(classroomAction === 'add_teacher' || classroomAction === 'edit_teacher') && (
                      <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)', textAlign: 'right' }}>
                        <h4 style={{ color: 'var(--color-primary)', marginBottom: '0.8rem', fontWeight: '700' }}>
                          {classroomAction === 'edit_teacher' ? '✏️ تعديل بيانات المعلم: ' + (editingTeacherObj?.name || '') : '👨‍🏫 إضافة معلم جديد للمنصة'}
                        </h4>
                        <form onSubmit={handleSaveTeacherForm}>
                          <div className="admin-form-group">
                            <label>اسم المعلم الكامل:</label>
                            <input type="text" className="admin-input" value={teacherFormName} onChange={e => setTeacherFormName(e.target.value)} required />
                          </div>
                          <div className="admin-form-group">
                            <label>كلمة المرور للدخول:</label>
                            <input type="text" className="admin-input" value={teacherFormPassword} onChange={e => setTeacherFormPassword(e.target.value)} required />
                          </div>
                          <div className="admin-form-group">
                            <label>رقم هاتف الواتساب:</label>
                            <input type="text" className="admin-input" placeholder="مثال: 9647701234567" value={teacherFormWhatsapp} onChange={e => setTeacherFormWhatsapp(e.target.value)} />
                          </div>
                          <div className="admin-form-group">
                            <label>تحديد الحلقة المسندة للمدرس:</label>
                            <select className="admin-input" value={teacherFormClassId} onChange={e => setTeacherFormClassId(e.target.value)}>
                              <option value="">بدون حلقة</option>
                              {classrooms.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                            <button type="submit" className="admin-submit-btn w-100" style={{ margin: 0 }}>💾 حفظ البيانات</button>
                            <button type="button" className="admin-submit-btn w-100" style={{ backgroundColor: '#ccc', color: '#333', margin: 0 }} onClick={() => setClassroomAction(null)}>إلغاء</button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* ADD/EDIT CLASSROOM FORM */}
                    {(classroomAction === 'add_classroom' || classroomAction === 'edit_classroom') && (
                      <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)', textAlign: 'right' }}>
                        <h4 style={{ color: 'var(--color-primary)', marginBottom: '0.8rem', fontWeight: '700' }}>
                          {classroomAction === 'edit_classroom' ? '✏️ تعديل حلقة: ' + (editingClassObj?.name || '') : '🏢 إضافة حلقة جديدة'}
                        </h4>
                        <form onSubmit={handleSaveClassroomForm}>
                          <div className="admin-form-group">
                            <label>اسم الحلقة:</label>
                            <input type="text" className="admin-input" placeholder="مثال: حلقة معاذ بن جبل" value={classFormName} onChange={e => setClassFormName(e.target.value)} required />
                          </div>
                          <div className="admin-form-group">
                            <label>تعيين المعلم المسؤول:</label>
                            <select className="admin-input" value={classFormTeacherId} onChange={e => setClassFormTeacherId(e.target.value)}>
                              <option value="">بدون معلم حالياً</option>
                              {teachers.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                            <button type="submit" className="admin-submit-btn w-100" style={{ margin: 0 }}>💾 حفظ البيانات</button>
                            <button type="button" className="admin-submit-btn w-100" style={{ backgroundColor: '#ccc', color: '#333', margin: 0 }} onClick={() => setClassroomAction(null)}>إلغاء</button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* CLASSROOMS LIST */}
                    <h3 className="mt-1" style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.8rem', textAlign: 'right' }}>قائمة حلقات المنصة</h3>
                    <p style={{ color: 'var(--color-text-gray)', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'right' }}>انقر فوق اسم الحلقة لفتح التفاصيل وتعديلها في صفحة مخصصة ومستقلة.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      {classrooms.map(cls => {
                        const classTeacher = teachers.find(t => t.classroomId === cls.id);
                        const classStudents = students.filter(s => s.classroomId === cls.id);
                        return (
                          <div 
                            key={cls.id} 
                            style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.15s', cursor: 'pointer' }}
                            onClick={() => {
                              setExpandedClassId(cls.id);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            <div style={{ padding: '1.2rem 1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRight: '5px solid var(--color-primary)' }}>
                              <span style={{ fontSize: '0.9rem', color: 'var(--color-primary)', fontWeight: 'bold', backgroundColor: 'rgba(46, 125, 50, 0.08)', padding: '0.4rem 0.8rem', borderRadius: '8px' }}>استعراض التفاصيل والتعديل ←</span>
                              <div style={{ textAlign: 'right' }}>
                                <strong style={{ fontSize: '1.1rem', color: 'var(--color-text-dark)' }}>{cls.name}</strong>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-gray)', marginTop: '0.25rem' }}>
                                  المعلم: {classTeacher ? classTeacher.name : 'لم يُعيّن'} | عدد الطلاب: {classStudents.length} طالب
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* STUDENTS WITH NO CLASSROOM SECTION */}
                    {students.filter(s => !s.classroomId).length > 0 && (
                      <div style={{ marginTop: '1.5rem', backgroundColor: '#fafafa', border: '1px dashed var(--color-border)', borderRadius: '10px', padding: '1rem', textAlign: 'right' }}>
                        <h4 style={{ color: 'var(--color-primary)', fontWeight: '750', marginBottom: '0.6rem' }}>👤 طلاب بدون حلقات مسندة ({students.filter(s => !s.classroomId).length} طلاب):</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {students.filter(s => !s.classroomId).map(student => (
                            <div key={student.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: '0.5rem 0.8rem', borderRadius: '6px', border: '1px solid #eee' }}>
                              <div>
                                <strong>{student.name} ({student.username})</strong>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-gray)' }}>الرمز: {student.password}</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-gray)' }}>إسناد حلقة:</span>
                                <select 
                                  style={{ fontSize: '0.75rem', padding: '0.2rem', borderRadius: '4px', border: '1px solid #ddd' }}
                                  value=""
                                  onChange={e => {
                                    if (e.target.value) {
                                      handleMoveStudent(student.id, e.target.value);
                                    }
                                  }}
                                >
                                  <option value="">اختر حلقة...</option>
                                  {classrooms.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* 2. DEDICATED CLASSROOM DETAIL VIEW (SEPARATE PAGE) */
                  (() => {
                    const cls = classrooms.find(c => c.id === expandedClassId);
                    if (!cls) return null;
                    const classTeacher = teachers.find(t => t.classroomId === cls.id);
                    const classStudents = students.filter(s => s.classroomId === cls.id);
                    return (
                      <div style={{ textAlign: 'right' }}>
                        {/* Top navigation and action bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid var(--color-primary-light)', paddingBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <button 
                            className="buy-btn" 
                            style={{ margin: 0, padding: '0.4rem 1rem', backgroundColor: '#666', color: '#ffffff', fontWeight: 'bold' }}
                            onClick={() => {
                              setExpandedClassId(null);
                              setClassroomAction(null);
                            }}
                          >
                            ← عودة لقائمة الحلقات
                          </button>
                          <div>
                            <h2 style={{ color: 'var(--color-primary)', margin: 0 }}>تفاصيل: {cls.name}</h2>
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-gray)' }}>إدارة الحلقة والمعلم والطلاب</span>
                          </div>
                        </div>

                        {/* RENDER FORMS DIRECTLY INSIDE CLASSROOM DETAIL VIEW IF ACTIVE */}
                        {(classroomAction === 'edit_student' || classroomAction === 'edit_teacher' || classroomAction === 'edit_classroom') && (
                          <div style={{ marginBottom: '1.5rem' }}>
                            {classroomAction === 'edit_student' && (
                              <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '1.2rem', boxShadow: 'var(--shadow-sm)' }}>
                                <h4 style={{ color: 'var(--color-primary)', marginBottom: '0.8rem', fontWeight: '700' }}>✏️ تعديل بيانات الطالب: {editingStudentObj?.name}</h4>
                                <form onSubmit={handleSaveStudentForm}>
                                  <div className="admin-form-group">
                                    <label>الاسم الثلاثي للطالب:</label>
                                    <input type="text" className="admin-input" value={studentFormName} onChange={e => setStudentFormName(e.target.value)} required />
                                  </div>
                                  <div className="admin-form-group">
                                    <label>اسم المستخدم للدخول (بالإنجليزي):</label>
                                    <input type="text" className="admin-input" placeholder="مثال: sarah" value={studentFormUsername} onChange={e => setStudentFormUsername(e.target.value)} required />
                                  </div>
                                  <div className="admin-form-group">
                                    <label>كلمة المرور:</label>
                                    <input type="text" className="admin-input" value={studentFormPassword} onChange={e => setStudentFormPassword(e.target.value)} required />
                                  </div>
                                  <div className="admin-form-group">
                                    <label>تحديد الحلقة المسند إليها:</label>
                                    <select className="admin-input" value={studentFormClassId} onChange={e => setStudentFormClassId(e.target.value)}>
                                      <option value="">بدون حلقة (مستقل)</option>
                                      {classrooms.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                    <button type="submit" className="admin-submit-btn w-100" style={{ margin: 0 }}>💾 حفظ البيانات</button>
                                    <button type="button" className="admin-submit-btn w-100" style={{ backgroundColor: '#ccc', color: '#333', margin: 0 }} onClick={() => setClassroomAction(null)}>إلغاء</button>
                                  </div>
                                </form>
                              </div>
                            )}

                            {classroomAction === 'edit_teacher' && (
                              <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '1.2rem', boxShadow: 'var(--shadow-sm)' }}>
                                <h4 style={{ color: 'var(--color-primary)', marginBottom: '0.8rem', fontWeight: '700' }}>✏️ تعديل بيانات المعلم: {editingTeacherObj?.name}</h4>
                                <form onSubmit={handleSaveTeacherForm}>
                                  <div className="admin-form-group">
                                    <label>اسم المعلم الكامل:</label>
                                    <input type="text" className="admin-input" value={teacherFormName} onChange={e => setTeacherFormName(e.target.value)} required />
                                  </div>
                                  <div className="admin-form-group">
                                    <label>كلمة المرور للدخول:</label>
                                    <input type="text" className="admin-input" value={teacherFormPassword} onChange={e => setTeacherFormPassword(e.target.value)} required />
                                  </div>
                                  <div className="admin-form-group">
                                    <label>رقم هاتف الواتساب:</label>
                                    <input type="text" className="admin-input" placeholder="مثال: 9647701234567" value={teacherFormWhatsapp} onChange={e => setTeacherFormWhatsapp(e.target.value)} />
                                  </div>
                                  <div className="admin-form-group">
                                    <label>تحديد الحلقة المسندة للمدرس:</label>
                                    <select className="admin-input" value={teacherFormClassId} onChange={e => setTeacherFormClassId(e.target.value)}>
                                      <option value="">بدون حلقة</option>
                                      {classrooms.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                    <button type="submit" className="admin-submit-btn w-100" style={{ margin: 0 }}>💾 حفظ البيانات</button>
                                    <button type="button" className="admin-submit-btn w-100" style={{ backgroundColor: '#ccc', color: '#333', margin: 0 }} onClick={() => setClassroomAction(null)}>إلغاء</button>
                                  </div>
                                </form>
                              </div>
                            )}

                            {classroomAction === 'edit_classroom' && (
                              <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '1.2rem', boxShadow: 'var(--shadow-sm)' }}>
                                <h4 style={{ color: 'var(--color-primary)', marginBottom: '0.8rem', fontWeight: '700' }}>✏️ تعديل حلقة: {editingClassObj?.name}</h4>
                                <form onSubmit={handleSaveClassroomForm}>
                                  <div className="admin-form-group">
                                    <label>اسم الحلقة:</label>
                                    <input type="text" className="admin-input" placeholder="مثال: حلقة معاذ بن جبل" value={classFormName} onChange={e => setClassFormName(e.target.value)} required />
                                  </div>
                                  <div className="admin-form-group">
                                    <label>تعيين المعلم المسؤول:</label>
                                    <select className="admin-input" value={classFormTeacherId} onChange={e => setClassFormTeacherId(e.target.value)}>
                                      <option value="">بدون معلم حالياً</option>
                                      {teachers.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                    <button type="submit" className="admin-submit-btn w-100" style={{ margin: 0 }}>💾 حفظ البيانات</button>
                                    <button type="button" className="admin-submit-btn w-100" style={{ backgroundColor: '#ccc', color: '#333', margin: 0 }} onClick={() => setClassroomAction(null)}>إلغاء</button>
                                  </div>
                                </form>
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ padding: '1.2rem', border: '1px solid var(--color-border)', borderRadius: '12px', backgroundColor: '#ffffff', boxShadow: 'var(--shadow-sm)' }}>
                          {/* Classroom Actions */}
                          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem', borderBottom: '1px solid #eee', paddingBottom: '0.8rem' }}>
                            <button 
                              className="buy-btn" 
                              style={{ margin: 0, padding: '0.3rem 0.8rem', fontSize: '0.8rem', backgroundColor: '#f1c40f', color: '#202020' }}
                              onClick={() => {
                                setClassroomAction('edit_classroom');
                                setEditingClassObj(cls);
                                setClassFormName(cls.name);
                                setClassFormTeacherId(cls.teacherId || '');
                                scrollToAdminForm();
                              }}
                            >
                              ✏️ تعديل اسم الحلقة
                            </button>
                            <button 
                              className="admin-delete-btn" 
                              style={{ margin: 0, padding: '0.3rem 0.8rem', fontSize: '0.8rem', borderRadius: '4px' }}
                              onClick={() => {
                                if (confirm("هل أنت متأكد من حذف الحلقة " + cls.name + " نهائياً؟")) {
                                  handleDeleteClassroomObj(cls.id);
                                  setExpandedClassId(null);
                                }
                              }}
                            >
                              ❌ حذف الحلقة
                            </button>
                          </div>

                          {/* Teacher Info */}
                          <div style={{ backgroundColor: '#fdfdfd', border: '1px solid #eee', borderRadius: '8px', padding: '0.8rem', marginBottom: '1.2rem' }}>
                            <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--color-primary)', marginBottom: '0.4rem' }}>👨‍🏫 معلم الحلقة:</div>
                            {classTeacher ? (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div>
                                  <strong>{classTeacher.name}</strong>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>
                                    كلمة المرور: {classTeacher.password} {classTeacher.whatsapp ? '| واتساب: ' + classTeacher.whatsapp : ''}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button 
                                    className="buy-btn" 
                                    style={{ margin: 0, padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 'bold', backgroundColor: '#e0a800', color: '#ffffff', borderRadius: '6px', border: 'none' }}
                                    onClick={() => {
                                      setClassroomAction('edit_teacher');
                                      setEditingTeacherObj(classTeacher);
                                      setTeacherFormName(classTeacher.name);
                                      setTeacherFormPassword(classTeacher.password || '123');
                                      setTeacherFormWhatsapp(classTeacher.whatsapp || '');
                                      setTeacherFormClassId(classTeacher.classroomId || '');
                                      scrollToAdminForm();
                                    }}
                                  >
                                    ✏️ تعديل حساب المعلم
                                  </button>
                                  <button 
                                    className="admin-delete-btn" 
                                    style={{ margin: 0, padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 'bold', backgroundColor: '#d84315', color: '#ffffff', borderRadius: '6px', border: 'none' }}
                                    onClick={() => handleDeleteClassroomTeacher(cls.id)}
                                  >
                                    ❌ إلغاء تعيين المعلم
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-gray)' }}>لم يتم تعيين معلم مسؤول لهذه الحلقة.</span>
                                <button 
                                  className="buy-btn" 
                                  style={{ margin: 0, padding: '0.15rem 0.5rem', fontSize: '0.75rem', backgroundColor: 'var(--color-primary-light)' }}
                                  onClick={() => {
                                    setClassroomAction('edit_classroom');
                                    setEditingClassObj(cls);
                                    setClassFormName(cls.name);
                                    setClassFormTeacherId('');
                                    scrollToAdminForm();
                                  }}
                                >
                                  ➕ تعيين معلم
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Students list */}
                          <div style={{ marginTop: '0.5rem' }}>
                            <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--color-primary)', marginBottom: '0.6rem' }}>👥 طلاب الحلقة ({classStudents.length} طلاب):</div>
                            
                            {/* Search and Add student */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                              <input 
                                type="text" 
                                className="admin-input" 
                                style={{ height: '34px', fontSize: '0.8rem', padding: '0 0.6rem', margin: 0 }}
                                placeholder="🔍 ابحث عن طالب بالاسم لإضافته لهذه الحلقة..."
                                value={studentSearchForClass}
                                onChange={e => setStudentSearchForClass(e.target.value)}
                              />
                              {studentSearchForClass.trim() !== '' ? (
                                <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px', backgroundColor: '#fafafa', padding: '0.3rem' }}>
                                  {students
                                    .filter(s => s.classroomId !== cls.id && s.name.toLowerCase().includes(studentSearchForClass.toLowerCase()))
                                    .map(s => {
                                      const studentClass = classrooms.find(c => c.id === s.classroomId);
                                      return (
                                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.5rem', borderBottom: '1px solid #eee', fontSize: '0.8rem' }}>
                                          <span>{s.name} ({studentClass ? 'حلقة: ' + studentClass.name : 'بدون حلقة'})</span>
                                          <button 
                                            className="buy-btn" 
                                            style={{ margin: 0, padding: '0.15rem 0.5rem', fontSize: '0.75rem', backgroundColor: 'var(--color-primary)' }}
                                            onClick={() => {
                                              // eslint-disable-next-line react-hooks/refs
                                              handleMoveStudent(s.id, cls.id);
                                              setStudentSearchForClass('');
                                              triggerToast('تمت إضافة الطالب ' + s.name + ' للحلقة بنجاح!');
                                            }}
                                          >
                                            ➕ إضافة للحلقة
                                          </button>
                                        </div>
                                      );
                                    })}
                                  {students.filter(s => s.classroomId !== cls.id && s.name.toLowerCase().includes(studentSearchForClass.toLowerCase())).length === 0 && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)', padding: '0.4rem', textAlign: 'center' }}>لا يوجد طلاب مطابَقين للبحث.</div>
                                  )}
                                </div>
                              ) : (
                                <select 
                                  className="admin-input" 
                                  style={{ height: '34px', fontSize: '0.8rem', padding: '0 0.4rem', margin: 0 }}
                                  value=""
                                  onChange={e => {
                                    if (e.target.value) {
                                      handleMoveStudent(e.target.value, cls.id);
                                    }
                                  }}
                                >
                                  <option value="">🔍 أو اختر طالب من القائمة مباشرة للإضافة...</option>
                                  {students.filter(s => s.classroomId !== cls.id).map(s => {
                                    const studentClass = classrooms.find(c => c.id === s.classroomId);
                                    return (
                                      <option key={s.id} value={s.id}>
                                        {s.name} ({studentClass ? 'حلقة: ' + studentClass.name : 'بدون حلقة'})
                                      </option>
                                    );
                                  })}
                                </select>
                              )}
                            </div>

                            {classStudents.length === 0 ? (
                              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-gray)', textAlign: 'center', padding: '1rem' }}>لا يوجد طلاب مضافين لهذه الحلقة بعد.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {classStudents.map(student => (
                                  <div key={student.id} style={{ display: 'flex', flexDirection: 'column', padding: '0.8rem', border: '1px solid #eee', borderRadius: '8px', backgroundColor: student.isSuspended ? '#fdf2f2' : '#fafafa' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                      <div>
                                        <strong style={{ color: student.isSuspended ? 'var(--color-error)' : 'var(--color-text-dark)', fontSize: '0.95rem' }}>
                                          {student.name} {student.isSuspended ? '⚠️ (العضوية معلقة)' : ''}
                                        </strong>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-gray)', marginTop: '0.2rem' }}>
                                          اسم المستخدم: {student.username} | الرمز: {student.password} | النقاط: {student.totalPoints}
                                        </div>
                                      </div>
                                      
                                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                        <button 
                                          className="buy-btn" 
                                          style={{ margin: 0, padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 'bold', backgroundColor: '#2e7d32', color: '#ffffff', borderRadius: '6px', border: 'none', opacity: student.isSuspended ? 0.5 : 1, boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}
                                          disabled={student.isSuspended}
                                          onClick={() => {
                                            setSelectedStudentId(student.id);
                                            setAdminTab('grades');
                                          }}
                                          title={student.isSuspended ? 'العضوية معلقة' : 'رصد درجات الطالب'}
                                        >
                                          📈 رصد درجات
                                        </button>
                                        <button 
                                          className="buy-btn" 
                                          style={{ margin: 0, padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 'bold', backgroundColor: '#e0a800', color: '#ffffff', borderRadius: '6px', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}
                                          onClick={() => {
                                            setClassroomAction('edit_student');
                                            setEditingStudentObj(student);
                                            setStudentFormName(student.name);
                                            setStudentFormUsername(student.username);
                                            setStudentFormPassword(student.password);
                                            setStudentFormClassId(student.classroomId || '');
                                            scrollToAdminForm();
                                          }}
                                        >
                                          ✏️ تعديل البيانات
                                        </button>
                                        <button 
                                          className="buy-btn" 
                                          style={{ margin: 0, padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 'bold', backgroundColor: student.isSuspended ? '#2e7d32' : '#e67e22', color: '#ffffff', borderRadius: '6px', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}
                                          onClick={() => handleToggleSuspendStudent(student.id)}
                                        >
                                          {student.isSuspended ? '✅ تفعيل الحساب' : '⚠️ تعليق العضوية'}
                                        </button>
                                        <button 
                                          className="admin-delete-btn" 
                                          style={{ margin: 0, padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 'bold', backgroundColor: '#c62828', color: '#ffffff', borderRadius: '6px', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}
                                          onClick={() => {
                                            if (confirm("هل أنت متأكد من حذف الطالب " + student.name + " نهائياً من المنصة؟")) {
                                              handleDeleteStudent(student.id);
                                            }
                                          }}
                                        >
                                          ❌ حذف الطالب
                                        </button>
                                      </div>
                                    </div>

                                    {/* Transfer class selector */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.5rem', borderTop: '1px dashed #eee', paddingTop: '0.5rem' }}>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-gray)' }}>🔄 نقل الطالب لحلقة أخرى:</span>
                                      <select 
                                        style={{ fontSize: '0.75rem', padding: '0.15rem', borderRadius: '4px', border: '1px solid #ddd' }}
                                        value={student.classroomId || ''}
                                        onChange={e => handleMoveStudent(student.id, e.target.value)}
                                      >
                                        <option value="">بدون حلقة</option>
                                        {classrooms.map(c => (
                                          <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bottom Return Button */}
                        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                          <button 
                            className="buy-btn" 
                            style={{ margin: 0, padding: '0.5rem 1.5rem', backgroundColor: '#666', color: '#ffffff', fontWeight: 'bold' }}
                            onClick={() => {
                              setExpandedClassId(null);
                              setClassroomAction(null);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            ← العودة لقائمة الحلقات
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {/* TAB CONTENT: DEDICATED STUDENT MANAGEMENT */}
            {adminTab === 'students' && (
              <div className="students-tab-container animate-fade-in" style={{ padding: '0.5rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ color: 'var(--color-primary)', fontWeight: '800', fontSize: '1.5rem', margin: 0 }}>🎓 إدارة الطلاب والبيانات</h3>
                    <p style={{ color: 'var(--color-text-gray)', fontSize: '0.875rem', marginTop: '0.25rem' }}>عرض، تعديل، نقل وحذف بيانات جميع طلاب المنصة بشكل احترافي ومباشر</p>
                  </div>
                  <button 
                    className="submit-grades-btn"
                    style={{ margin: 0, padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '10px', fontWeight: 'bold' }}
                    onClick={() => {
                      setEditingStudentObj(null);
                      setStudentFormName('');
                      setStudentFormUsername('');
                      setStudentFormPassword('');
                      setStudentFormPhone('');
                      setStudentFormClassId('');
                      setClassroomAction(classroomAction === 'add_student' ? null : 'add_student');
                    }}
                  >
                    {classroomAction === 'add_student' ? '✕ إلغاء الإضافة' : '➕ إضافة طالب جديد'}
                  </button>
                </div>

                {/* 1. Quick Statistics Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid var(--color-border)', boxShadow: 'rgba(0, 0, 0, 0.02) 0px 4px 12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)', fontSize: '1.5rem', width: '45px', height: '45px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👥</div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>إجمالي الطلاب</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--color-text-dark)' }}>{students.length}</div>
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid var(--color-border)', boxShadow: 'rgba(0, 0, 0, 0.02) 0px 4px 12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ backgroundColor: '#e6f4ea', color: '#137333', fontSize: '1.5rem', width: '45px', height: '45px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✅</div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>الطلاب النشطين</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#137333' }}>{students.filter(s => !s.isSuspended).length}</div>
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid var(--color-border)', boxShadow: 'rgba(0, 0, 0, 0.02) 0px 4px 12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ backgroundColor: '#fce8e6', color: '#c5221f', fontSize: '1.5rem', width: '45px', height: '45px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚠️</div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>العضويات المعلقة</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#c5221f' }}>{students.filter(s => s.isSuspended).length}</div>
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid var(--color-border)', boxShadow: 'rgba(0, 0, 0, 0.02) 0px 4px 12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ backgroundColor: '#fef7e0', color: '#b06000', fontSize: '1.5rem', width: '45px', height: '45px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>❓</div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>طلاب بدون حلقة</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#b06000' }}>{students.filter(s => !s.classroomId).length}</div>
                    </div>
                  </div>
                </div>

                {/* 2. Add / Edit Student Form Component */}
                {(classroomAction === 'add_student' || classroomAction === 'edit_student') && (
                  <div className="animate-fade-in" style={{ backgroundColor: '#ffffff', borderRadius: '15px', padding: '1.5rem', border: '1.5px solid var(--color-primary-light)', marginBottom: '1.5rem', boxShadow: 'rgba(99, 99, 99, 0.1) 0px 8px 24px' }}>
                    <h4 style={{ color: 'var(--color-primary)', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {classroomAction === 'edit_student' ? '✏️ تعديل بيانات الطالب' : '➕ إضافة طالب جديد للمنصة'}
                    </h4>
                    <form onSubmit={handleSaveStudentForm} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-dark)', display: 'block', marginBottom: '0.4rem' }}>الاسم الثلاثي للطالب *</label>
                        <input 
                          type="text" 
                          className="admin-input" 
                          required
                          placeholder="الاسم الكامل للطالب" 
                          value={studentFormName} 
                          onChange={e => setStudentFormName(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-dark)', display: 'block', marginBottom: '0.4rem' }}>اسم المستخدم (للدخول) *</label>
                        <input 
                          type="text" 
                          className="admin-input" 
                          required
                          disabled={classroomAction === 'edit_student'}
                          placeholder="مثال: ahmad_ali" 
                          value={studentFormUsername} 
                          onChange={e => setStudentFormUsername(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-dark)', display: 'block', marginBottom: '0.4rem' }}>كلمة المرور / الرمز *</label>
                        <input 
                          type="text" 
                          className="admin-input" 
                          required
                          placeholder="الرمز السري الخاص بالطالب" 
                          value={studentFormPassword} 
                          onChange={e => setStudentFormPassword(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-dark)', display: 'block', marginBottom: '0.4rem' }}>رقم هاتف الطالب / ولي الأمر (اختياري)</label>
                        <input 
                          type="text" 
                          className="admin-input" 
                          placeholder="مثال: 966500000000" 
                          value={studentFormPhone} 
                          onChange={e => setStudentFormPhone(e.target.value)} 
                        />
                      </div>
                      <div style={{ gridColumn: 'span 1' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-dark)', display: 'block', marginBottom: '0.4rem' }}>الحلقة المسندة</label>
                        <select 
                          className="admin-input" 
                          value={studentFormClassId} 
                          onChange={e => setStudentFormClassId(e.target.value)}
                        >
                          <option value="">-- بدون حلقة (غير مسند) --</option>
                          {classrooms.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button 
                          type="button" 
                          className="buy-btn" 
                          style={{ margin: 0, padding: '0.6rem 1.2rem', backgroundColor: '#666', color: '#fff' }}
                          onClick={() => {
                            setClassroomAction(null);
                            setEditingStudentObj(null);
                            setStudentFormName('');
                            setStudentFormUsername('');
                            setStudentFormPassword('');
                            setStudentFormPhone('');
                            setStudentFormClassId('');
                          }}
                        >
                          إلغاء
                        </button>
                        <button 
                          type="submit" 
                          className="submit-grades-btn" 
                          style={{ margin: 0, padding: '0.6rem 1.5rem' }}
                        >
                          {classroomAction === 'edit_student' ? 'حفظ التعديلات' : 'إضافة الطالب'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* 3. Search and Filters Bar */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid var(--color-border)', marginBottom: '1.2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                    <input 
                      type="text" 
                      className="admin-input" 
                      style={{ margin: 0, paddingRight: '2.5rem' }}
                      placeholder="🔍 ابحث بالاسم، اسم المستخدم، الرمز، أو رقم الهاتف..." 
                      value={studentSearchQuery}
                      onChange={e => setStudentSearchQuery(e.target.value)}
                    />
                  </div>
                  <div style={{ minWidth: '200px' }}>
                    <select 
                      className="admin-input" 
                      style={{ margin: 0 }}
                      value={studentFilterClass}
                      onChange={e => setStudentFilterClass(e.target.value)}
                    >
                      <option value="all">📁 جميع الحلقات</option>
                      <option value="none">⚠️ بدون حلقة (غير مسند)</option>
                      {classrooms.map(c => (
                        <option key={c.id} value={c.id}> حلقة: {c.name}</option>
                      ))}
                    </select>
                  </div>
                  {studentSearchQuery || studentFilterClass !== 'all' ? (
                    <button 
                      className="buy-btn text-danger" 
                      style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      onClick={() => {
                        setStudentSearchQuery('');
                        setStudentFilterClass('all');
                      }}
                    >
                      تصفية الفلاتر
                    </button>
                  ) : null}
                </div>

                {/* 4. Students Responsive Grid/List */}
                {(() => {
                  const filteredStudents = students.filter(s => {
                    const matchesSearch = 
                      s.name.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
                      s.username.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
                      s.password.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
                      (s.phone && s.phone.includes(studentSearchQuery));
                    
                    const matchesClass = 
                      studentFilterClass === 'all' ? true :
                      studentFilterClass === 'none' ? !s.classroomId :
                      s.classroomId === studentFilterClass;

                    return matchesSearch && matchesClass;
                  });

                  if (filteredStudents.length === 0) {
                    return (
                      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '3rem 1rem', border: '1px solid var(--color-border)', textAlign: 'center', color: 'var(--color-text-gray)' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                        <p style={{ fontWeight: 'bold', fontSize: '1.1rem', margin: 0 }}>لم يتم العثور على أي طالب يطابق معايير البحث!</p>
                        <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>تأكد من كتابة الاسم بشكل صحيح أو تصفية الحلقات بشكل أدق.</p>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                      {filteredStudents.map(student => {
                        const studentClass = classrooms.find(c => c.id === student.classroomId);
                        
                        return (
                          <div 
                            key={student.id} 
                            style={{ 
                              backgroundColor: student.isSuspended ? '#fdf2f2' : '#ffffff', 
                              borderRadius: '15px', 
                              padding: '1.2rem', 
                              border: student.isSuspended ? '1px solid #f8b4b4' : '1px solid var(--color-border)',
                              boxShadow: 'rgba(0, 0, 0, 0.02) 0px 4px 12px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '1rem',
                              transition: 'all 0.2s ease-in-out'
                            }}
                            className="student-card-item"
                          >
                            <div>
                              {/* Header info */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.8rem' }}>
                                <div style={{ 
                                  backgroundColor: student.isSuspended ? '#fce8e6' : 'var(--color-primary-light)', 
                                  color: student.isSuspended ? '#c5221f' : 'var(--color-primary)', 
                                  width: '40px', 
                                  height: '40px', 
                                  borderRadius: '50%', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  fontSize: '1.2rem',
                                  fontWeight: 'bold'
                                }}>
                                  {student.name.trim().charAt(0) || '🎓'}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <h4 style={{ 
                                    margin: 0, 
                                    fontSize: '1rem', 
                                    fontWeight: '700', 
                                    color: student.isSuspended ? '#c5221f' : 'var(--color-text-dark)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                  }}>
                                    {student.name}
                                    {student.isSuspended && <span style={{ fontSize: '0.7rem', backgroundColor: '#fce8e6', color: '#c5221f', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>حساب معلق</span>}
                                  </h4>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-gray)' }}>المعرف: {student.id}</span>
                                </div>
                              </div>

                              {/* Student Details */}
                              <div style={{ backgroundColor: student.isSuspended ? '#fff5f5' : '#f8fafc', padding: '0.8rem', borderRadius: '10px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid var(--color-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--color-text-gray)' }}>اسم المستخدم:</span>
                                  <strong style={{ fontFamily: 'monospace', color: 'var(--color-text-dark)' }}>{student.username}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--color-text-gray)' }}>الرمز (كلمة المرور):</span>
                                  <strong style={{ color: 'var(--color-primary)', backgroundColor: 'rgba(79, 70, 229, 0.08)', padding: '0.05rem 0.4rem', borderRadius: '4px' }}>{student.password}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--color-text-gray)' }}>رقم الهاتف:</span>
                                  {student.phone ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <strong style={{ color: 'var(--color-text-dark)' }}>{student.phone}</strong>
                                      <a 
                                        href={`https://wa.me/${student.phone.replace(/[^0-9]/g, '')}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        title="اتصال عبر واتساب"
                                        style={{ fontSize: '1.1rem', textDecoration: 'none', cursor: 'pointer' }}
                                      >
                                        🟢
                                      </a>
                                    </div>
                                  ) : (
                                    <span style={{ color: '#aaa', fontStyle: 'italic' }}>غير مسجل</span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--color-text-gray)' }}>الحلقة الحالية:</span>
                                  <strong>{studentClass ? studentClass.name : 'بدون حلقة'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--color-text-gray)' }}>إجمالي النقاط:</span>
                                  <strong style={{ color: '#137333' }}>⭐ {student.totalPoints} (المتاحة: {student.availablePoints})</strong>
                                </div>
                              </div>
                            </div>

                            {/* Control and move operations */}
                            <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                              {/* Move Classroom dropdown */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-gray)', fontWeight: 'bold' }}>🔄 نقل لحلقة أخرى:</span>
                                <select 
                                  style={{ margin: 0, padding: '0.2rem 0.5rem', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid var(--color-border)', width: '60%', backgroundColor: '#fff' }}
                                  value={student.classroomId || ''}
                                  onChange={e => handleMoveStudent(student.id, e.target.value)}
                                >
                                  <option value="">-- بدون حلقة --</option>
                                  {classrooms.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Action Buttons */}
                              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                                <button 
                                  className="buy-btn"
                                  style={{ margin: 0, padding: '0.4rem 0.6rem', flex: 1, fontSize: '0.75rem', fontWeight: 'bold', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}
                                  onClick={() => {
                                    setEditingStudentObj(student);
                                    setStudentFormName(student.name);
                                    setStudentFormUsername(student.username);
                                    setStudentFormPassword(student.password);
                                    setStudentFormPhone(student.phone || '');
                                    setStudentFormClassId(student.classroomId || '');
                                    setClassroomAction('edit_student');
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                >
                                  ✏️ تعديل
                                </button>
                                <button 
                                  className="buy-btn"
                                  style={{ 
                                    margin: 0, 
                                    padding: '0.4rem 0.6rem', 
                                    flex: 1.2, 
                                    fontSize: '0.75rem', 
                                    fontWeight: 'bold', 
                                    borderRadius: '8px', 
                                    backgroundColor: student.isSuspended ? '#e6f4ea' : '#fce8e6', 
                                    color: student.isSuspended ? '#137333' : '#c5221f',
                                    border: 'none'
                                  }}
                                  onClick={() => handleToggleSuspendStudent(student.id)}
                                >
                                  {student.isSuspended ? '🔓 تفعيل الحساب' : '🔒 تعليق'}
                                </button>
                                <button 
                                  className="buy-btn text-danger"
                                  style={{ margin: 0, padding: '0.4rem 0.6rem', flex: 0.8, fontSize: '0.75rem', fontWeight: 'bold', borderRadius: '8px', border: '1px solid var(--color-error)' }}
                                  onClick={() => handleDeleteStudent(student.id)}
                                >
                                  🗑️ حذف
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* TAB CONTENT: DEDICATED TEACHERS MANAGEMENT */}
            {adminTab === 'teachers' && (
              <div className="teachers-tab-container animate-fade-in" style={{ padding: '0.5rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ color: 'var(--color-primary)', fontWeight: '800', fontSize: '1.5rem', margin: 0 }}>إدارة الكادر التعليمي</h3>
                    <p style={{ color: 'var(--color-text-gray)', fontSize: '0.875rem', marginTop: '0.25rem' }}>عرض، إضافة، تعديل وحذف حسابات المعلمين والمعلمات بالمنصة</p>
                  </div>
                  <button 
                    className="submit-grades-btn"
                    style={{ margin: 0, padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '10px', fontWeight: 'bold' }}
                    onClick={() => {
                      setEditingTeacherObj(null);
                      setTeacherFormName('');
                      setTeacherFormPassword('123');
                      setTeacherFormWhatsapp('');
                      setTeacherFormClassId('');
                      setClassroomAction(classroomAction === 'add_teacher' ? null : 'add_teacher');
                    }}
                  >
                    {classroomAction === 'add_teacher' ? '✕ إلغاء الإضافة' : 'إضافة معلم جديد'}
                  </button>
                </div>

                {/* 1. Statistics Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid var(--color-border)', boxShadow: 'rgba(0, 0, 0, 0.02) 0px 4px 12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)', fontSize: '1.5rem', width: '45px', height: '45px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>م</div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>إجمالي المعلمين</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--color-text-dark)' }}>{teachers.length}</div>
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid var(--color-border)', boxShadow: 'rgba(0, 0, 0, 0.02) 0px 4px 12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ backgroundColor: '#e8f0fe', color: '#1a73e8', fontSize: '1.5rem', width: '45px', height: '45px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>م</div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>الأساتذة (ذكور)</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#1a73e8' }}>{teachers.filter(t => t.gender === 'male' || t.username.includes('.m.')).length}</div>
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid var(--color-border)', boxShadow: 'rgba(0, 0, 0, 0.02) 0px 4px 12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ backgroundColor: '#fce4ec', color: '#d81b60', fontSize: '1.5rem', width: '45px', height: '45px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>م</div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>المعلمات (إناث)</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#d81b60' }}>{teachers.filter(t => t.gender === 'female' || t.username.includes('.f.')).length}</div>
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid var(--color-border)', boxShadow: 'rgba(0, 0, 0, 0.02) 0px 4px 12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ backgroundColor: '#fef7e0', color: '#b06000', fontSize: '1.5rem', width: '45px', height: '45px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>؟</div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>بدون حلقة مسندة</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#b06000' }}>{teachers.filter(t => !t.classroomId).length}</div>
                    </div>
                  </div>
                </div>

                {/* 2. Add / Edit Teacher Form */}
                {(classroomAction === 'add_teacher' || classroomAction === 'edit_teacher') && (
                  <div className="animate-fade-in" style={{ backgroundColor: '#ffffff', borderRadius: '15px', padding: '1.5rem', border: '1.5px solid var(--color-primary-light)', marginBottom: '1.5rem', boxShadow: 'rgba(99, 99, 99, 0.1) 0px 8px 24px' }}>
                    <h4 style={{ color: 'var(--color-primary)', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {classroomAction === 'edit_teacher' ? 'تعديل بيانات المعلم' : 'إضافة معلم جديد للمنصة'}
                    </h4>
                    <form onSubmit={handleSaveTeacherForm} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-dark)', display: 'block', marginBottom: '0.4rem' }}>الاسم الكامل للمعلم *</label>
                        <input 
                          type="text" 
                          className="admin-input" 
                          required
                          placeholder="الاسم الكامل للمعلم" 
                          value={teacherFormName} 
                          onChange={e => setTeacherFormName(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-dark)', display: 'block', marginBottom: '0.4rem' }}>رمز الدخول (رقمي فقط) *</label>
                        <input 
                          type="text" 
                          className="admin-input" 
                          required
                          placeholder="مثال: 569842" 
                          value={teacherFormPassword} 
                          onChange={e => setTeacherFormPassword(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-dark)', display: 'block', marginBottom: '0.4rem' }}>رقم هاتف الواتساب (اختياري)</label>
                        <input 
                          type="text" 
                          className="admin-input" 
                          placeholder="مثال: 966500000000" 
                          value={teacherFormWhatsapp} 
                          onChange={e => setTeacherFormWhatsapp(e.target.value)} 
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-dark)', display: 'block', marginBottom: '0.4rem' }}>الحلقة المسندة</label>
                        <select 
                          className="admin-input" 
                          value={teacherFormClassId} 
                          onChange={e => setTeacherFormClassId(e.target.value)}
                        >
                          <option value="">-- بدون حلقة (غير مسند) --</option>
                          {classrooms.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button 
                          type="button" 
                          className="buy-btn" 
                          style={{ margin: 0, padding: '0.6rem 1.2rem', backgroundColor: '#666', color: '#fff' }}
                          onClick={() => {
                            setClassroomAction(null);
                            setEditingTeacherObj(null);
                            setTeacherFormName('');
                            setTeacherFormPassword('123');
                            setTeacherFormWhatsapp('');
                            setTeacherFormClassId('');
                          }}
                        >
                          إلغاء
                        </button>
                        <button 
                          type="submit" 
                          className="submit-grades-btn" 
                          style={{ margin: 0, padding: '0.6rem 1.5rem' }}
                        >
                          {classroomAction === 'edit_teacher' ? 'حفظ التعديلات' : 'إضافة المعلم'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* 3. Search and Filters Bar */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid var(--color-border)', marginBottom: '1.2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: '250px' }}>
                    <input 
                      type="text" 
                      className="admin-input" 
                      style={{ margin: 0 }}
                      placeholder="ابحث بالاسم أو اسم المستخدم..." 
                      value={teacherSearchQuery}
                      onChange={e => setTeacherSearchQuery(e.target.value)}
                    />
                  </div>
                  <div style={{ minWidth: '180px' }}>
                    <select 
                      className="admin-input" 
                      style={{ margin: 0 }}
                      value={teacherFilterGender}
                      onChange={e => setTeacherFilterGender(e.target.value)}
                    >
                      <option value="all">جميع المعلمين والمعلمات</option>
                      <option value="male">الأساتذة (ذكور)</option>
                      <option value="female">المعلمات (إناث)</option>
                    </select>
                  </div>
                  {teacherSearchQuery || teacherFilterGender !== 'all' ? (
                    <button 
                      className="buy-btn text-danger" 
                      style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      onClick={() => {
                        setTeacherSearchQuery('');
                        setTeacherFilterGender('all');
                      }}
                    >
                      تصفية الفلاتر
                    </button>
                  ) : null}
                </div>

                {/* 4. Teachers Grid List */}
                {(() => {
                  const filteredTeachers = teachers.filter(t => {
                    const matchesSearch = 
                      t.name.toLowerCase().includes(teacherSearchQuery.toLowerCase()) ||
                      (t.username && t.username.toLowerCase().includes(teacherSearchQuery.toLowerCase()));
                    
                    const isFemale = t.gender === 'female' || (t.username && t.username.includes('.f.'));
                    const isMale = !isFemale;
                    
                    const matchesGender = 
                      teacherFilterGender === 'all' ? true :
                      teacherFilterGender === 'male' ? isMale :
                      teacherFilterGender === 'female' ? isFemale : true;

                    return matchesSearch && matchesGender;
                  });

                  if (filteredTeachers.length === 0) {
                    return (
                      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '3rem 1rem', border: '1px solid var(--color-border)', textAlign: 'center', color: 'var(--color-text-gray)' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>لا نتائج</div>
                        <p style={{ fontWeight: 'bold', fontSize: '1.1rem', margin: 0 }}>لم يتم العثور على أي معلم يطابق معايير البحث!</p>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                      {filteredTeachers.map(teacher => {
                        const matchedClass = classrooms.find(c => c.id === teacher.classroomId || c.teacherId === teacher.id);
                        const isFemale = teacher.gender === 'female' || (teacher.username && teacher.username.includes('.f.'));
                        
                        return (
                          <div 
                            key={teacher.id}
                            style={{ 
                              backgroundColor: '#ffffff', 
                              borderRadius: '15px', 
                              padding: '1.2rem', 
                              border: '1px solid var(--color-border)',
                              boxShadow: 'rgba(0, 0, 0, 0.02) 0px 4px 12px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '1rem'
                            }}
                          >
                            <div>
                              {/* Header info */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.8rem' }}>
                                <div style={{ 
                                  backgroundColor: isFemale ? '#fce4ec' : '#e8f0fe', 
                                  color: isFemale ? '#d81b60' : '#1a73e8', 
                                  width: '40px', 
                                  height: '40px', 
                                  borderRadius: '50%', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  fontSize: '1.2rem',
                                  fontWeight: 'bold'
                                }}>
                                  م
                                </div>
                                <div style={{ flex: 1 }}>
                                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-text-dark)' }}>
                                    {teacher.name}
                                  </h4>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-gray)' }}>
                                    {isFemale ? 'معلمة حلقة' : 'معلم حلقة'}
                                  </span>
                                </div>
                              </div>

                              {/* Details list */}
                              <div style={{ backgroundColor: '#f8fafc', padding: '0.8rem', borderRadius: '10px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid var(--color-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--color-text-gray)' }}>اسم المستخدم:</span>
                                  <strong style={{ fontFamily: 'monospace', color: 'var(--color-text-dark)' }}>{teacher.username || 'لم ينشأ بعد'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--color-text-gray)' }}>رمز الدخول (Password):</span>
                                  <strong style={{ color: 'var(--color-primary)', backgroundColor: 'rgba(79, 70, 229, 0.08)', padding: '0.05rem 0.4rem', borderRadius: '4px' }}>{teacher.password}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--color-text-gray)' }}>رقم التواصل:</span>
                                  {teacher.whatsapp && teacher.whatsapp !== 'لا يوجد رقم مسجل' ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <strong style={{ color: 'var(--color-text-dark)' }}>{teacher.whatsapp}</strong>
                                      <a 
                                        href={`https://wa.me/${teacher.whatsapp.replace(/[^0-9]/g, '')}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        title="اتصال واتساب مباشر"
                                        style={{ fontSize: '0.85rem', color: 'var(--color-primary)', textDecoration: 'none', cursor: 'pointer' }}
                                      >
                                        (واتساب)
                                      </a>
                                    </div>
                                  ) : (
                                    <span style={{ color: '#aaa', fontStyle: 'italic' }}>لا يوجد رقم مسجل</span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--color-text-gray)' }}>الحلقة المسندة:</span>
                                  <strong style={{ color: matchedClass ? 'var(--color-primary)' : '#b06000' }}>
                                    {matchedClass ? `حلقة: ${matchedClass.name}` : 'غير مسند لحلقة'}
                                  </strong>
                                </div>
                              </div>
                            </div>

                            {/* Actions footer */}
                            <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '0.8rem', display: 'flex', gap: '0.4rem' }}>
                              <button 
                                className="buy-btn"
                                style={{ margin: 0, padding: '0.4rem 0.6rem', flex: 1.2, fontSize: '0.75rem', fontWeight: 'bold', borderRadius: '8px' }}
                                onClick={() => {
                                  setEditingTeacherObj(teacher);
                                  setTeacherFormName(teacher.name);
                                  setTeacherFormPassword(teacher.password);
                                  setTeacherFormWhatsapp(teacher.whatsapp || '');
                                  setTeacherFormClassId(teacher.classroomId || (matchedClass ? matchedClass.id : ''));
                                  setClassroomAction('edit_teacher');
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                              >
                                تعديل البيانات
                              </button>
                              <button 
                                className="buy-btn text-danger"
                                style={{ margin: 0, padding: '0.4rem 0.6rem', flex: 0.8, fontSize: '0.75rem', fontWeight: 'bold', borderRadius: '8px', border: '1px solid var(--color-error)' }}
                                onClick={() => handleDeleteTeacher(teacher.id)}
                              >
                                حذف
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* TAB CONTENT: STORE MANAGEMENT (MERGED) */}
            {adminTab === 'store' && (
              <div>
                {/* Sub tabs for Store */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
                  <button 
                    className="buy-btn" 
                    style={{ flex: 1, margin: 0, padding: '0.6rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: storeSubTab === 'orders' ? 'var(--color-primary)' : '#ffffff', color: storeSubTab === 'orders' ? '#ffffff' : 'var(--color-text-dark)', fontWeight: '700', minWidth: '120px' }}
                    onClick={() => setStoreSubTab('orders')}
                  >
                    🛒 الطلبات ({purchaseOrders.filter(o => o.status === 'pending').length})
                  </button>
                  <button 
                    className="buy-btn" 
                    style={{ flex: 1, margin: 0, padding: '0.6rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: storeSubTab === 'inventory' ? 'var(--color-primary)' : '#ffffff', color: storeSubTab === 'inventory' ? '#ffffff' : 'var(--color-text-dark)', fontWeight: '700', minWidth: '120px' }}
                    onClick={() => setStoreSubTab('inventory')}
                  >
                    🎁 المعروضات والجوائز
                  </button>
                  <button 
                    className="buy-btn" 
                    style={{ flex: 1, margin: 0, padding: '0.6rem', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: storeSubTab === 'preview' ? '#1a7f4b' : '#ffffff', color: storeSubTab === 'preview' ? '#ffffff' : 'var(--color-text-dark)', fontWeight: '700', minWidth: '120px' }}
                    onClick={() => setStoreSubTab('preview')}
                  >
                    👁️ معاينة المتجر
                  </button>
                </div>

                {/* PREVIEW SUB-TAB: Show store as students see it */}
                {storeSubTab === 'preview' && (
                  <div>
                    <div style={{ textAlign: 'right', marginBottom: '1rem', padding: '0.7rem 1rem', background: 'linear-gradient(135deg, #e8f5e9, #f1f8e9)', borderRadius: '10px', border: '1px solid #c8e6c9' }}>
                      <p style={{ fontSize: '0.85rem', color: '#2e7d32', margin: 0, fontWeight: '600' }}>
                        👁️ هذا هو شكل المتجر كما يراه الطلاب تماماً — للمراجعة قبل إضافة أو تعديل منتج
                      </p>
                    </div>
                    <div className="store-grid">
                      {storeProducts.length === 0 ? (
                        <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-gray)', gridColumn: '1/-1' }}>لا توجد منتجات في المتجر حالياً.</p>
                      ) : (
                        storeProducts.map(product => (
                          <div key={product.id} className="product-card">
                            <img src={product.image} className="product-image" alt={product.name} />
                            <div className="product-title">{product.name}</div>
                            <div className="product-price">
                              <span className="coin-icon"></span>
                              <span>{product.price} نقطة</span>
                            </div>
                            <div className="product-stock">المخزن المتاح: {product.stock} قطع</div>
                            <button
                              className="buy-btn"
                              disabled={product.stock <= 0}
                              style={{ opacity: 0.7, cursor: 'default' }}
                              onClick={() => triggerToast('هذه معاينة فقط - الشراء متاح للطلاب')}
                            >
                              {product.stock <= 0 ? 'نفدت الكمية' : '🛒 شراء (معاينة)'}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {storeSubTab === 'orders' && (
                  <div>
                    <h3>طلبات شراء الجوائز من الطلاب (المقايضة والتسليم)</h3>
                    <p style={{ color: 'var(--color-text-gray)', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'right' }}>
                      تستعرض هذه الشاشة الهدايا والطلبات التي تم شراؤها من قبل الطلاب بنقاطهم. يرجى تسليم الهدية للطالب في المسجد ثم تأكيد التسليم.
                    </p>
                    <div className="mt-1">
                      {purchaseOrders.length === 0 ? (
                        <p style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-gray)' }}>لا توجد طلبات شراء مسجلة حالياً.</p>
                      ) : (
                        purchaseOrders.map(order => (
                          <div key={order.id} className="admin-list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem', textAlign: 'right' }}>
                            <div className="d-flex justify-between w-100">
                              <div>
                                <strong>الطالب: {order.studentName}</strong>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-primary-light)', fontWeight: '700' }}>الهدية المطلوبة: {order.productName}</div>
                              </div>
                              <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{order.price} نقطة</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>التاريخ: {order.date}</div>
                              </div>
                            </div>
                            <div className="d-flex justify-between align-center w-100" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                              <div>
                                <span>حالة الطلب: </span>
                                <span 
                                  style={{ 
                                    fontWeight: '700', 
                                    color: order.status === 'pending' ? 'var(--color-error)' : 'var(--color-success)',
                                    backgroundColor: order.status === 'pending' ? 'rgba(198, 40, 40, 0.1)' : 'rgba(46, 125, 50, 0.1)',
                                    padding: '0.1rem 0.6rem',
                                    borderRadius: '4px',
                                    fontSize: '0.8rem'
                                  }}
                                >
                                  {order.status === 'pending' ? 'قيد الانتظار' : 'تم التسليم والمقايضة'}
                                </span>
                              </div>
                              {order.status === 'pending' && (
                                <button 
                                  className="buy-btn" 
                                  style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', margin: 0 }}
                                  onClick={() => {
                                    const nextPurchaseOrders = purchaseOrders.map(o => {
                                      if (o.id === order.id) {
                                        return { ...o, status: 'delivered' };
                                      }
                                      return o;
                                    });
                                    setPurchaseOrders(nextPurchaseOrders);
                                    saveUpdatesToFirebase({ purchaseOrders: nextPurchaseOrders });
                                    triggerToast('تم تأكيد تسليم الهدية للطالب بنجاح!');
                                  }}
                                >
                                  تأكيد التسليم الفعلي للمكافأة
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {storeSubTab === 'inventory' && (
                  <div>
                    <h3>إضافة وتعديل هدايا المتجر</h3>
                    <form onSubmit={handleSaveStoreProduct} className="mt-1" style={{ textAlign: 'right' }}>
                      <div className="admin-form-group">
                        <label>اسم الجائزة / اللعبة:</label>
                        <input type="text" className="admin-input" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} required />
                      </div>
                      <div className="admin-form-group">
                        <label>صورة الهدية (رفع من الجهاز):</label>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="admin-input" 
                          style={{ padding: '0.3rem' }}
                          onChange={async (e) => {
                            const file = e.target.files[0];
                            if (file) {
                              const res = await compressAndResizeImage(file, 400, 400, 0.7);
                              setNewProduct({ ...newProduct, image: res });
                            }
                          }} 
                        />
                        {newProduct.image && (
                          <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                            <img src={newProduct.image} alt="Preview" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--color-border)' }} />
                          </div>
                        )}
                      </div>
                      <div className="admin-form-group">
                        <label>السعر بالنقاط:</label>
                        <input type="number" className="admin-input" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} required />
                      </div>
                      <div className="admin-form-group">
                        <label>الكمية المتوفرة بالمخزن:</label>
                        <input type="number" className="admin-input" value={newProduct.stock} onChange={e => setNewProduct({...newProduct, stock: e.target.value})} required />
                      </div>
                      <div className="d-flex gap-05">
                        <button type="submit" className="admin-submit-btn w-100">{editingProductId ? 'حفظ تعديلات الهدية' : 'إضافة الجائزة للمتجر'}</button>
                        {editingProductId && (
                          <button 
                            type="button" 
                            className="admin-submit-btn w-100" 
                            style={{ backgroundColor: '#ccc', color: '#333' }}
                            onClick={() => {
                              setEditingProductId(null);
                              setNewProduct({ name: '', image: '', price: 0, stock: 0 });
                            }}
                          >
                            إلغاء التعديل
                          </button>
                        )}
                      </div>
                    </form>

                    <h3 className="mt-1" style={{ textAlign: 'right' }}>قائمة المنتجات الحالية بالمتجر</h3>
                    <div className="mt-1" style={{ textAlign: 'right' }}>
                      {storeProducts.map(p => (
                        <div key={p.id} className="admin-list-item">
                          <div>
                            <strong>{p.name}</strong>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)' }}>
                              السعر: {p.price} نقطة | الكمية المتوفرة: {p.stock}
                            </div>
                          </div>
                          <div className="d-flex gap-05">
                            <button className="buy-btn" style={{ padding: '0.2rem 0.5rem', backgroundColor: '#f1c40f', color: '#333' }} onClick={() => startEditProduct(p)}>تعديل</button>
                            <button className="admin-delete-btn" onClick={() => deleteStoreProduct(p.id)}>حذف</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            
{/* TAB CONTENT: EXPORT DATA */}
            {adminTab === 'export' && (
              <div className="text-center mt-1" style={{ maxWidth: '500px', margin: '0 auto', padding: '1rem' }}>
                <h3 style={{ fontWeight: '750', color: 'var(--color-primary)', marginBottom: '0.5rem' }}>تصدير شيتات البيانات والتقارير التفصيلية</h3>
                <p style={{ color: 'var(--color-text-gray)', fontSize: '0.85rem', marginBottom: '1.8rem' }}>
                  تتيح لك هذه الأداة تصدير كشوفات كاملة ومفصلة بصيغة ملفات CSV متوافقة مع برنامج Microsoft Excel لتتبع كافة التفاصيل.
                </p>
                <div className="d-flex flex-column gap-1">
                  <button 
                    className="submit-grades-btn" 
                    style={{ margin: 0, padding: '0.8rem 1rem', fontWeight: 'bold' }} 
                    onClick={() => handleExportData('students')}
                  >
                    📊 تصدير كشف معلومات ونقاط الطلاب بالتفصيل
                  </button>
                  <button 
                    className="submit-grades-btn" 
                    style={{ margin: 0, padding: '0.8rem 1rem', backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)', fontWeight: 'bold' }} 
                    onClick={() => handleExportData('teachers')}
                  >
                    👥 تصدير كشف حسابات ومعلومات المعلمين بالتفصيل
                  </button>
                  <button 
                    className="submit-grades-btn" 
                    style={{ margin: 0, padding: '0.8rem 1rem', backgroundColor: '#e2e8f0', color: '#334155', fontWeight: 'bold' }} 
                    onClick={() => handleExportData('classrooms')}
                  >
                    🏢 تصدير كشف الحلقات والدورات بكامل التفاصيل
                  </button>
                </div>
              </div>
            )}

            {/* TAB CONTENT: AI TOOLS */}
            {adminTab === 'ai' && (
              <div className="p-1" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h3 style={{ color: 'var(--color-primary)', fontWeight: '700', marginBottom: '1rem', textAlign: 'right' }}>
                  🤖 أدوات الإدارة المساعدة بالذكاء الاصطناعي
                </h3>

                {/* 1. Quiz Generator */}
                <div className="ai-tool-card">
                  <h4>📝 مولد أسئلة اختبارات الحفظ</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)', marginBottom: '0.8rem' }}>
                    اختر السورة وعدد الأسئلة ليقوم الذكاء الاصطناعي بإنشاء اختبار مخصص مع الإجابة النموذجية.
                  </p>
                  <div className="admin-form-group">
                    <label>السورة الكريمة المستهدفة:</label>
                    <input type="text" className="admin-input" value={aiSelectedSurah} onChange={e => setAiSelectedSurah(e.target.value)} placeholder="مثال: سورة النبأ، سورة الملك..." />
                  </div>
                  <div className="admin-form-group">
                    <label>عدد الأسئلة المطلوبة:</label>
                    <input type="number" className="admin-input" min="1" max="15" value={aiQuestionCount} onChange={e => setAiQuestionCount(Number(e.target.value))} />
                  </div>
                  <button className="modern-btn-primary" onClick={handleTeacherGenerateQuiz} disabled={isTeacherAiLoading}>
                    {isTeacherAiLoading ? '⏳ جاري الإنشاء...' : '📝 توليد أسئلة الاختبار الآن'}
                  </button>
                </div>

                {/* 2. Encouragement message Generator */}
                <div className="ai-tool-card">
                  <h4>🎉 مولد الرسائل والتهاني التشجيعية للطلاب</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)', marginBottom: '0.8rem' }}>
                    اكتب اسم الطالب ونقاطه لإنشاء خطاب تهنئة وتشجيع مميز لإرساله لولي الأمر.
                  </p>
                  <div className="admin-form-group">
                    <label>اسم الطالب (الثلاثي):</label>
                    <input type="text" className="admin-input" value={aiStudentName} onChange={e => setAiStudentName(e.target.value)} placeholder="مثال: سارة طالب ياسين..." />
                  </div>
                  <div className="admin-form-group">
                    <label>مجموع النقاط الحالي (اختياري):</label>
                    <input type="text" className="admin-input" value={aiStudentPoints} onChange={e => setAiStudentPoints(e.target.value)} placeholder="مثال: 120 نقطة..." />
                  </div>
                  <button className="modern-btn-primary" style={{ background: 'linear-gradient(135deg, var(--color-accent-hover) 0%, var(--color-accent) 100%)', color: '#202020' }} onClick={handleTeacherGenerateEncouragement} disabled={isTeacherAiLoading}>
                    {isTeacherAiLoading ? '⏳ جاري الصياغة...' : '🎉 توليد رسالة التشجيع والتهنئة'}
                  </button>
                </div>

                {/* Result box */}
                {teacherAiOutput && (
                  <div className="ai-tool-card" style={{ border: '2px solid var(--color-primary-light)' }}>
                    <div className="d-flex justify-between align-center mb-1">
                      <h4 style={{ margin: 0 }}>✨ النص الذكي المُولد</h4>
                      <button 
                        className="buy-btn" 
                        style={{ margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={() => {
                          navigator.clipboard.writeText(teacherAiOutput);
                          triggerToast('تم نسخ النص المولد إلى الحافظة!');
                        }}
                      >
                        📋 نسخ النص المولد
                      </button>
                    </div>
                    <div className="ai-result-box">
                      {teacherAiOutput}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: PROFILE SETTINGS */}
            {adminTab === 'profile' && (
              <div className="p-1" style={{ maxWidth: '500px', margin: '0 auto' }}>
                <div className="profile-card-modern">
                  <h3 style={{ color: 'var(--color-primary)', fontWeight: '700', marginBottom: '1.5rem' }}>إعدادات حساب إدارة المنصة</h3>
                  <form onSubmit={handleSaveProfileSettings}>
                    <div className="avatar-upload-container">
                      <div className="avatar-preview-wrapper">
                        {profileAvatar ? (
                          <img src={profileAvatar} alt="Profile" />
                        ) : (
                          <span style={{ fontSize: '3rem' }}>👤</span>
                        )}
                      </div>
                      <label htmlFor="avatar-file-admin" className="avatar-upload-overlay">
                        📷
                      </label>
                      <input 
                        id="avatar-file-admin"
                        type="file" 
                        accept="image/*" 
                        className="avatar-file-input"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const res = await compressAndResizeImage(file, 200, 200, 0.7);
                            setProfileAvatar(res);
                          }
                        }} 
                      />
                    </div>

                    <div className="admin-form-group" style={{ textAlign: 'right' }}>
                      <label>الاسم الكامل للمشرف:</label>
                      <input type="text" className="admin-input" value={profileName} onChange={e => setProfileName(e.target.value)} required />
                    </div>



                    <div className="admin-form-group mt-1" style={{ textAlign: 'right' }}>
                      <label>تغيير كلمة المرور الجديدة:</label>
                      <input type="password" className="admin-input" value={profilePassword} onChange={e => setProfilePassword(e.target.value)} required />
                    </div>

                    <button type="submit" className="modern-btn-primary mt-1">
                      💾 حفظ التغييرات والملف
                    </button>
                    
                    <button type="button" onClick={handleLogout} className="modern-btn-logout">
                      🚪 تسجيل الخروج من الحساب
                    </button>
                  </form>

                  {currentUser.role === 'superadmin' && (
                    <form onSubmit={handleSaveGeminiKey} style={{ marginTop: '1.5rem', borderTop: '2px solid var(--color-border)', paddingTop: '1rem', textAlign: 'right' }}>
                      <h4 style={{ color: 'var(--color-primary)', fontWeight: '700', marginBottom: '0.7rem' }}>
                        🤖 إعداد مفتاح الذكاء الاصطناعي
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-gray)', marginBottom: '0.8rem', lineHeight: '1.5' }}>
                        الصق المفتاح الجديد هنا لتفعيل المساعد الذكي للطلاب فوراً دون الحاجة لمدير الملفات.
                      </p>
                      <div className="admin-form-group">
                        <input
                          type="text"
                          className="admin-input"
                          placeholder="الصق مفتاح Gemini API هنا..."
                          value={geminiApiKeyInput}
                          onChange={e => setGeminiApiKeyInput(e.target.value)}
                          style={{ fontFamily: 'monospace', fontSize: '0.8rem', direction: 'ltr' }}
                        />
                      </div>
                      <button type="submit" className="modern-btn-primary" style={{ backgroundColor: '#1a7f4b', marginTop: '0.5rem' }}>
                        🔑 حفظ مفتاح الذكاء الاصطناعي
                      </button>
                    </form>
                  )}

                </div>
              </div>
            )}

            </div>

            {/* Bottom Nav for Mobile Admins */}
            <nav className="admin-bottom-nav">
              {(currentUser.role === 'superadmin' || currentUser.role === 'admin') && (
                <>
                  <button className={`nav-item ${adminTab === 'grades' ? 'active' : ''}`} onClick={() => setAdminTab('grades')}>
                    <span className="nav-icon">📈</span>
                    <span>الدرجات</span>
                  </button>
                  <button className={`nav-item ${adminTab === 'classrooms' ? 'active' : ''}`} onClick={() => setAdminTab('classrooms')}>
                    <span className="nav-icon">🏢</span>
                    <span>الحلقات</span>
                  </button>
                </>
              )}
              {(currentUser.role === 'superadmin' || currentUser.role === 'admin' || currentUser.role === 'store') && (
                <button className={`nav-item ${adminTab === 'store' ? 'active' : ''}`} onClick={() => setAdminTab('store')}>
                  <span className="nav-icon">🎁</span>
                  <span>المتجر</span>
                  {purchaseOrders.filter(o => o.status === 'pending').length > 0 && (
                    <span className="nav-badge" style={{ position: 'absolute', top: '2px', right: '50%', transform: 'translateX(18px)', backgroundColor: 'var(--color-error)', color: 'white', borderRadius: '50%', fontSize: '0.7rem', padding: '0.1rem 0.35rem', zIndex: 10 }}>
                      {purchaseOrders.filter(o => o.status === 'pending').length}
                    </span>
                  )}
                </button>
              )}
              <button className="nav-item" onClick={() => setIsAdminSidebarOpen(true)}>
                <span className="nav-icon">⚙️</span>
                <span>المزيد</span>
              </button>
            </nav>

          </main>
        </div>
      )}

      </div>

      {/* CONFIRMATION POPUP MODAL */}
      {showGradingPopup && currentGradingData && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-icon">🔖</div>
            <h3 style={{ marginBottom: '1rem', fontWeight: '700' }}>تأكيد رصد الدرجات اليومي</h3>
            
            <div className="modal-item">
              <span>درجة الحفظ والتجويد:</span>
              <strong>{currentGradingData.memorization} / 20</strong>
            </div>
            <div className="modal-item">
              <span>عدد الآيات المحفوظة:</span>
              <strong>{currentGradingData.versesCount} آية</strong>
            </div>
            <div className="modal-item">
              <span>درجة السلوك والأدب:</span>
              <strong>{currentGradingData.behavior} / 5</strong>
            </div>
            <div className="modal-item">
              <span>درجة الحضور والغياب:</span>
              <strong>{currentGradingData.attendance} / 10</strong>
            </div>
            {currentGradingData.activity > 0 && (
              <div className="modal-item">
                <span>درجة النشاط والمشاركة:</span>
                <strong>{currentGradingData.activity} / 10</strong>
              </div>
            )}

            <div className="modal-total" style={{ borderTop: '2px solid var(--color-primary)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
              المجموع الكلي المضاف: {currentGradingData.total.toFixed(1)} نقطة
            </div>

            <button className="modal-confirm-btn" onClick={confirmGrades}>
              تأكيد وترحيل النقاط لرصيد الطالب
            </button>
            <button 
              className="modal-confirm-btn mt-1" 
              style={{ backgroundColor: '#ccc', color: '#333' }} 
              onClick={() => setShowGradingPopup(false)}
            >
              تراجع وتعديل
            </button>
          </div>
        </div>
      )}

      {/* Toast Notice */}
      {toastMessage && (
        <div className="toast-msg">
          {toastMessage}
        </div>
      )}

    </div>
  );
}

export default App;
