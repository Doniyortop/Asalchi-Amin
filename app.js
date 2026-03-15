const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory "database"
let products = [
  {
    id: 1,
    name: 'Мёд липовый',
    description: 'Натуральный липовый мёд из окрестностей Самарканда.',
    price: 60000,
    unit: 'за 1 кг',
    image: '/images/linden-honey.jpg',
    isActive: true
  },
  {
    id: 2,
    name: 'Мёд акациевый',
    description: 'Светлый и нежный мёд из акации, подходит для детей.',
    price: 70000,
    unit: 'за 1 кг',
    image: '/images/acacia-honey.jpg',
    isActive: true
  },
  {
    id: 3,
    name: 'Пыльца (обножка)',
    description: 'Натуральная пчелиная пыльца — источник витаминов.',
    price: 50000,
    unit: 'за 300 г',
    image: '/images/pollen.jpg',
    isActive: true
  }
];

let users = [
  // Демонстрационный админ-пользователь
  // email: admin@asalchi.uz, пароль: admin123
];

let orders = [];

// In-memory reviews database
let reviews = [];

// Simple i18n
const SUPPORTED_LANGS = ['ru', 'uz', 'en'];
const DEFAULT_LANG = 'ru';

const translations = {
  ru: {
    nav: {
      catalog: 'Каталог',
      cart: 'Корзина',
      admin: 'Админ',
      login: 'Вход',
      register: 'Регистрация',
      logout: 'Выйти'
    },
    home: {
      title: 'Магазин домашнего мёда',
      subtitle:
        'Натуральный мёд и продукты пчеловодства с пасек возле Самарканда. Без сахара, без добавок — только настоящий вкус.',
      deliveryTitle: 'Доставка по Самарканду',
      deliveryItems: [
        'Доставка курьером по городу',
        'Оплата наличными при получении',
        'Аккуратная упаковка и свежий мёд'
      ],
      emptyProducts: 'Товары пока не добавлены.',
      addToCart: 'В корзину'
    },
    cart: {
      title: 'Корзина',
      subtitle: 'Проверьте заказ перед оформлением.',
      empty: 'Ваша корзина пуста. Перейдите в каталог и добавьте мёд.',
      goCatalog: 'Перейти в каталог',
      headers: {
        product: 'Товар',
        price: 'Цена',
        qty: 'Кол-во',
        sum: 'Сумма'
      },
      total: 'Итого',
      continue: 'Продолжить покупки',
      checkout: 'Оформить заказ',
      remove: 'Удалить'
    },
    auth: {
      loginTitle: 'Вход в аккаунт',
      loginSubtitle: 'Авторизуйтесь, чтобы оформить заказ быстрее.',
      registerTitle: 'Регистрация',
      registerSubtitle: 'Создайте аккаунт, чтобы удобнее оформлять заказы.',
      email: 'Email',
      password: 'Пароль',
      name: 'Имя',
      phone: 'Телефон',
      loginButton: 'Войти',
      registerButton: 'Зарегистрироваться',
      noAccount: 'Нет аккаунта?',
      haveAccount: 'Уже есть аккаунт?',
      toRegister: 'Зарегистрироваться',
      toLogin: 'Войти',
      passwordHint: 'Минимум 6 символов.'
    },
    checkout: {
      title: 'Оформление заказа',
      subtitle: 'Укажите адрес доставки и подтвердите заказ.',
      addressLabel: 'Адрес доставки',
      addressHint:
        'Укажите город (Самарканд), улицу, дом, подъезд, ориентир.',
      commentLabel: 'Комментарий к заказу (необязательно)',
      paymentLabel: 'Способ оплаты',
      paymentCash: 'Наличными при получении',
      paymentHint: 'Другие способы оплаты пока недоступны.',
      mapLabel: 'Точка на карте (по желанию)',
      mapHint:
        'Кликните по карте, чтобы отметить дом или место встречи курьера в Самарканде.',
      submit: 'Подтвердить заказ',
      summaryTitle: 'Ваш заказ'
    },
    order: {
      successTitle: 'Спасибо за заказ!',
      successSubtitle: 'Мы свяжемся с вами по телефону для подтверждения и уточнения времени доставки.',
      orderNumber: 'Заказ №',
      openInMaps: 'открыть в картах',
      orderContents: 'Состав заказа',
      totalToPay: 'Итого к оплате',
      backToCatalog: 'Вернуться в каталог'
    },
    reviews: {
      title: 'Отзывы',
      leaveReview: 'Оставить отзыв',
      yourRating: 'Ваша оценка',
      comment: 'Комментарий',
      submitReview: 'Отправить отзыв',
      reviewSuccess: 'Спасибо за отзыв!',
      reviewPending: 'Ваш отзыв отправлен на модерацию',
      averageRating: 'Средний рейтинг',
      totalReviews: 'всего отзывов',
      noReviews: 'Пока нет отзывов',
      filterByRating: 'Фильтр по оценке',
      allRatings: 'Все оценки',
      fiveStars: '5 звезд',
      fourStars: '4 звезды',
      threeStars: '3 звезды',
      twoStars: '2 звезды',
      oneStar: '1 звезда'
    }
  },
  uz: {
    nav: {
      catalog: 'Katalog',
      cart: 'Savat',
      admin: 'Admin',
      login: 'Kirish',
      register: 'Ro‘yxatdan o‘tish',
      logout: 'Chiqish'
    },
    home: {
      title: 'Uy asali do‘koni',
      subtitle:
        'Samarqand atrofidagi pasikalardan olingan tabiiy asal va asalarichilik mahsulotlari.',
      deliveryTitle: 'Samarqand bo‘ylab yetkazib berish',
      deliveryItems: [
        'Shahar bo‘ylab kuryer yetkazib berishi',
        'Qabul qilishda naqd to‘lov',
        'Ehtiyotkor o‘rash va yangi asal'
      ],
      emptyProducts: 'Mahsulotlar hali qo‘shilmagan.',
      addToCart: 'Savatchaga'
    },
    cart: {
      title: 'Savat',
      subtitle: 'Buyurtmani rasmiylashtirishdan oldin tekshiring.',
      empty: 'Savatchingiz bo‘sh. Katalogga o‘ting va asal qo‘shing.',
      goCatalog: 'Katalogga o‘tish',
      headers: {
        product: 'Mahsulot',
        price: 'Narx',
        qty: 'Soni',
        sum: 'Jami'
      },
      total: 'Jami',
      continue: 'Xaridlarni davom ettirish',
      checkout: 'Buyurtma berish',
      remove: 'O‘chirish'
    },
    auth: {
      loginTitle: 'Akkauntga kirish',
      loginSubtitle: 'Tezroq buyurtma berish uchun kiring.',
      registerTitle: 'Ro‘yxatdan o‘tish',
      registerSubtitle:
        'Buyurtmalarni qulayroq rasmiylashtirish uchun akkaunt yarating.',
      email: 'Email',
      password: 'Parol',
      name: 'Ism',
      phone: 'Telefon',
      loginButton: 'Kirish',
      registerButton: 'Ro‘yxatdan o‘tish',
      noAccount: 'Akkauntingiz yo‘qmi?',
      haveAccount: 'Allaqachon akkauntingiz bormi?',
      toRegister: 'Ro‘yxatdan o‘tish',
      toLogin: 'Kirish',
      passwordHint: 'Kamida 6 ta belgi.'
    },
    checkout: {
      title: 'Buyurtmani rasmiylashtirish',
      subtitle: 'Yetkazib berish manzilini kiriting va buyurtmani tasdiqlang.',
      addressLabel: 'Yetkazib berish manzili',
      addressHint:
        'Shahar (Samarqand), ko‘cha, uy, bino, yo‘nalish ko‘rsatkichi.',
      commentLabel: 'Izoh (majburiy emas)',
      paymentLabel: 'To‘lov usuli',
      paymentCash: 'Qabul qilishda naqd',
      paymentHint: 'Hozircha faqat naqd to‘lov mavjud.',
      mapLabel: 'Xaritada nuqta (ixtiyoriy)',
      mapHint:
        'Kuryer uchrashadigan joy yoki uyni ko‘rsatish uchun xaritada bosing.',
      submit: 'Buyurtmani tasdiqlash',
      summaryTitle: 'Sizning buyurtmangiz'
    },
    order: {
      successTitle: 'Buyurtma uchun rahmat!',
      successSubtitle: 'Tasdiqlash va yetkazib berish vaqtini aniqlash uchun sizga telefon qilamiz.',
      orderNumber: 'Buyurtma №',
      openInMaps: 'xaritada ochish',
      orderContents: 'Buyurtma tarkibi',
      totalToPay: 'Jami to‘lov',
      backToCatalog: 'Katalogga qaytish'
    },
    reviews: {
      title: 'Sharhlar',
      leaveReview: 'Sharh qoldirish',
      yourRating: 'Sizning baholang',
      comment: 'Izoh',
      submitReview: 'Sharhni yuborish',
      reviewSuccess: 'Sharh uchun rahmat!',
      reviewPending: 'Sizning sharhingiz moderatsiyaga yuborildi',
      averageRating: "O'rtacha reyting",
      totalReviews: 'jami sharhlar',
      noReviews: 'Hozircha sharhlar yo\'q',
      filterByRating: 'Baho bo\'yicha filter',
      allRatings: 'Barcha baholar',
      fiveStars: '5 yulduz',
      fourStars: '4 yulduz',
      threeStars: '3 yulduz',
      twoStars: '2 yulduz',
      oneStar: '1 yulduz'
    }
  },
  en: {
    nav: {
      catalog: 'Catalog',
      cart: 'Cart',
      admin: 'Admin',
      login: 'Log in',
      register: 'Sign up',
      logout: 'Log out'
    },
    home: {
      title: 'Home Honey Shop',
      subtitle:
        'Natural honey and beekeeping products from apiaries around Samarkand.',
      deliveryTitle: 'Delivery in Samarkand',
      deliveryItems: [
        'Courier delivery across the city',
        'Cash payment on delivery',
        'Careful packaging and fresh honey'
      ],
      emptyProducts: 'No products have been added yet.',
      addToCart: 'Add to cart'
    },
    cart: {
      title: 'Cart',
      subtitle: 'Review your order before checkout.',
      empty: 'Your cart is empty. Go to catalog and add some honey.',
      goCatalog: 'Go to catalog',
      headers: {
        product: 'Product',
        price: 'Price',
        qty: 'Qty',
        sum: 'Total'
      },
      total: 'Total',
      continue: 'Continue shopping',
      checkout: 'Checkout',
      remove: 'Remove'
    },
    auth: {
      loginTitle: 'Log in',
      loginSubtitle: 'Log in to place orders faster.',
      registerTitle: 'Sign up',
      registerSubtitle: 'Create an account for more convenient checkout.',
      email: 'Email',
      password: 'Password',
      name: 'Name',
      phone: 'Phone',
      loginButton: 'Log in',
      registerButton: 'Sign up',
      noAccount: 'No account?',
      haveAccount: 'Already have an account?',
      toRegister: 'Sign up',
      toLogin: 'Log in',
      passwordHint: 'At least 6 characters.'
    },
    checkout: {
      title: 'Checkout',
      subtitle: 'Enter the delivery address and confirm your order.',
      addressLabel: 'Delivery address',
      addressHint:
        'Specify city (Samarkand), street, house, entrance, and landmark.',
      commentLabel: 'Order comment (optional)',
      paymentLabel: 'Payment method',
      paymentCash: 'Cash on delivery',
      paymentHint: 'Other payment methods are not available yet.',
      mapLabel: 'Point on map (optional)',
      mapHint:
        'Click on the map to mark the house or meeting point for the courier.',
      submit: 'Confirm order',
      summaryTitle: 'Your order'
    },
    order: {
      successTitle: 'Thank you for your order!',
      successSubtitle: 'We will contact you by phone to confirm and clarify the delivery time.',
      orderNumber: 'Order #',
      openInMaps: 'open in maps',
      orderContents: 'Order contents',
      totalToPay: 'Total to pay',
      backToCatalog: 'Back to catalog'
    },
    reviews: {
      title: 'Reviews',
      leaveReview: 'Leave a review',
      yourRating: 'Your rating',
      comment: 'Comment',
      submitReview: 'Submit review',
      reviewSuccess: 'Thank you for your review!',
      reviewPending: 'Your review has been sent for moderation',
      averageRating: 'Average rating',
      totalReviews: 'total reviews',
      noReviews: 'No reviews yet',
      filterByRating: 'Filter by rating',
      allRatings: 'All ratings',
      fiveStars: '5 stars',
      fourStars: '4 stars',
      threeStars: '3 stars',
      twoStars: '2 stars',
      oneStar: '1 star'
    }
  }
};

// File uploads (product images)
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    cb(null, unique + ext.toLowerCase());
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Можно загружать только изображения'));
    }
    cb(null, true);
  }
});

// Создаём демо-админа при старте
async function createDemoAdmin() {
  const existing = users.find((u) => u.email === 'admin@asalchi.uz');
  if (existing) return;
  const hash = await bcrypt.hash('admin123', 10);
  users.push({
    id: 1,
    name: 'Администратор',
    email: 'admin@asalchi.uz',
    phone: '+998',
    passwordHash: hash,
    isAdmin: true
  });
}

// Session & middlewares
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'asalchi-amin-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 4 // 4 часа
    }
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Language middleware
app.use((req, res, next) => {
  let lang = req.query.lang || req.session.lang || DEFAULT_LANG;
  if (!SUPPORTED_LANGS.includes(lang)) {
    lang = DEFAULT_LANG;
  }
  req.session.lang = lang;
  res.locals.currentLang = lang;
  res.locals.langs = SUPPORTED_LANGS;

  const dict = translations[lang] || translations[DEFAULT_LANG];
  res.locals.t = (key) => {
    const parts = key.split('.');
    let value = dict;
    for (const p of parts) {
      if (value && Object.prototype.hasOwnProperty.call(value, p)) {
        value = value[p];
      } else {
        return key;
      }
    }
    return value;
  };
  next();
});

// Helpers
function ensureCart(req) {
  if (!req.session.cart) {
    req.session.cart = [];
  }
}

function getCartTotal(cart) {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).send('Доступ запрещён');
  }
  next();
}

// Create demo admin user
async function createDemoAdmin() {
  const existingAdmin = users.find(u => u.email === 'admin@asalchi.uz');
  if (!existingAdmin) {
    const hash = await bcrypt.hash('admin123', 10);
    users.push({
      id: 1,
      name: 'Администратор',
      email: 'admin@asalchi.uz',
      phone: '+998',
      passwordHash: hash,
      isAdmin: true
    });
  }
}

// Inject globals into templates
app.use((req, res, next) => {
  ensureCart(req);
  res.locals.currentUser = req.session.user || null;
  res.locals.cartCount = req.session.cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  res.locals.cartTotal = getCartTotal(req.session.cart);
  next();
});

// ROUTES

// Главная — каталог
app.get('/', (req, res) => {
  const activeProducts = products.filter((p) => p.isActive);
  const approvedReviews = reviews.filter(r => r.approved);
  res.render('index', { 
    title: 'Каталог мёда', 
    products: activeProducts,
    reviews: approvedReviews
  });
});

// Корзина
app.get('/cart', (req, res) => {
  res.render('cart', {
    title: 'Корзина',
    cart: req.session.cart,
    total: getCartTotal(req.session.cart)
  });
});

app.post('/cart/add/:id', (req, res) => {
  ensureCart(req);
  const productId = Number(req.params.id);
  const quantity = Number(req.body.quantity) || 1;
  const product = products.find((p) => p.id === productId && p.isActive);
  if (!product) {
    return res.redirect('/');
  }
  const existing = req.session.cart.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    req.session.cart.push({
      productId,
      name: product.name,
      price: product.price,
      quantity
    });
  }
  res.redirect('/cart');
});

app.post('/cart/update/:id', (req, res) => {
  ensureCart(req);
  const productId = Number(req.params.id);
  const quantity = Math.max(1, Number(req.body.quantity) || 1);
  const item = req.session.cart.find((i) => i.productId === productId);
  if (item) {
    item.quantity = quantity;
  }
  res.redirect('/cart');
});

app.post('/cart/remove/:id', (req, res) => {
  ensureCart(req);
  const productId = Number(req.params.id);
  req.session.cart = req.session.cart.filter(
    (i) => i.productId !== productId
  );
  res.redirect('/cart');
});

// Регистрация
app.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Регистрация', error: null, values: {} });
});

app.post('/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  const values = { name, email, phone };
  if (!name || !email || !phone || !password) {
    return res.render('auth/register', {
      title: 'Регистрация',
      error: 'Заполните все поля',
      values
    });
  }
  const existing = users.find((u) => u.email === email);
  if (existing) {
    return res.render('auth/register', {
      title: 'Регистрация',
      error: 'Пользователь с таким email уже существует',
      values
    });
  }
  const hash = await bcrypt.hash(password, 10);
  const newUser = {
    id: users.length ? users[users.length - 1].id + 1 : 2,
    name,
    email,
    phone,
    passwordHash: hash,
    isAdmin: false
  };
  users.push(newUser);
  req.session.user = {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    phone: newUser.phone,
    isAdmin: newUser.isAdmin
  };
  res.redirect('/');
});

// Вход
app.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Вход в аккаунт', error: null, values: {} });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const values = { email };
  const user = users.find((u) => u.email === email);
  if (!user) {
    return res.render('auth/login', {
      title: 'Вход в аккаунт',
      error: 'Неверный email или пароль',
      values
    });
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.render('auth/login', {
      title: 'Вход в аккаунт',
      error: 'Неверный email или пароль',
      values
    });
  }
  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isAdmin: user.isAdmin
  };
  res.redirect('/');
});

// Выход
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Оформление заказа
app.get('/checkout', requireAuth, (req, res) => {
  ensureCart(req);
  if (!req.session.cart.length) {
    return res.redirect('/cart');
  }
  res.render('checkout', {
    title: 'Оформление заказа',
    cart: req.session.cart,
    total: getCartTotal(req.session.cart),
    error: null,
    values: {}
  });
});

app.post('/checkout', requireAuth, (req, res) => {
  ensureCart(req);
  if (!req.session.cart.length) {
    return res.redirect('/cart');
  }
  const { address, comment, paymentMethod, latitude, longitude } = req.body;
  const values = { address, comment, paymentMethod, latitude, longitude };
  if (!address || !paymentMethod) {
    return res.render('checkout', {
      title: 'Оформление заказа',
      cart: req.session.cart,
      total: getCartTotal(req.session.cart),
      error: 'Укажите адрес и способ оплаты',
      values
    });
  }
  if (paymentMethod !== 'cash') {
    return res.render('checkout', {
      title: 'Оформление заказа',
      cart: req.session.cart,
      total: getCartTotal(req.session.cart),
      error: 'Сейчас доступна только оплата наличными при получении',
      values
    });
  }

  const user = req.session.user;
  const newOrder = {
    id: orders.length ? orders[orders.length - 1].id + 1 : 1,
    userId: user.id,
    customerName: user.name,
    customerPhone: user.phone,
    address,
    comment,
    paymentMethod,
    location:
      latitude && longitude
        ? {
            latitude: Number(latitude),
            longitude: Number(longitude)
          }
        : null,
    items: req.session.cart.map((item) => ({ ...item })),
    total: getCartTotal(req.session.cart),
    status: 'new',
    createdAt: new Date()
  };
  orders.push(newOrder);
  req.session.cart = [];
  res.render('order-success', {
    title: 'Заказ оформлен',
    order: newOrder
  });
});

// Админ-панель
app.get('/admin', requireAdmin, (req, res) => {
  res.render('admin/dashboard', {
    title: 'Админ-панель',
    products,
    orders
  });
});

// Создание товара
app.get('/admin/products/new', requireAdmin, (req, res) => {
  res.render('admin/product-form', {
    title: 'Новый товар',
    product: null,
    error: null
  });
});

app.post('/admin/products', requireAdmin, upload.single('imageFile'), (req, res) => {
  const { name, description, price, unit, isActive } = req.body;
  if (!name || !price) {
    return res.render('admin/product-form', {
      title: 'Новый товар',
      product: null,
      error: 'Название и цена обязательны'
    });
  }
  let imagePath = '';
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }

  const newProduct = {
    id: products.length ? products[products.length - 1].id + 1 : 1,
    name,
    description,
    price: Number(price),
    unit: unit || '',
    image: imagePath,
    isActive: !!isActive
  };
  products.push(newProduct);
  res.redirect('/admin');
});

// Редактирование товара
app.get('/admin/products/:id/edit', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.redirect('/admin');
  }
  res.render('admin/product-form', {
    title: 'Редактирование товара',
    product,
    error: null
  });
});

app.post('/admin/products/:id', requireAdmin, upload.single('imageFile'), (req, res) => {
  const id = Number(req.params.id);
  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.redirect('/admin');
  }
  const { name, description, price, unit, isActive } = req.body;
  if (!name || !price) {
    return res.render('admin/product-form', {
      title: 'Редактирование товара',
      product,
      error: 'Название и цена обязательны'
    });
  }
  product.name = name;
  product.description = description;
  product.price = Number(price);
  product.unit = unit || '';

  if (req.file) {
    product.image = '/uploads/' + req.file.filename;
  }

  product.isActive = !!isActive;
  res.redirect('/admin');
});

// Удаление товара
app.post('/admin/products/:id/delete', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  products = products.filter((p) => p.id !== id);
  res.redirect('/admin');
});

// Обновление статуса заказа
app.post('/admin/orders/:id/status', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  const order = orders.find((o) => o.id === id);
  if (order) {
    order.status = status || order.status;
  }
  res.redirect('/admin');
});

// Отзывы
app.get('/reviews', (req, res) => {
  const productReviews = reviews.filter(r => r.productId && r.approved);
  const reviewsByProduct = {};
  
  productReviews.forEach(review => {
    if (!reviewsByProduct[review.productId]) {
      reviewsByProduct[review.productId] = [];
    }
    reviewsByProduct[review.productId].push(review);
  });
  
  res.render('reviews', {
    title: 'Отзывы',
    reviews: productReviews,
    reviewsByProduct,
    products
  });
});

app.post('/reviews', (req, res) => {
  const { orderId, productId, rating, comment, customerName } = req.body;
  
  if (!orderId || !productId || !rating || !customerName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const newReview = {
    id: reviews.length ? reviews[reviews.length - 1].id + 1 : 1,
    orderId: Number(orderId),
    productId: Number(productId),
    customerName,
    rating: Number(rating),
    comment: comment || '',
    date: new Date().toISOString().split('T')[0],
    approved: false // Требует модерации
  };
  
  reviews.push(newReview);
  
  res.json({ 
    success: true, 
    message: 'Ваш отзыв отправлен на модерацию',
    review: newReview 
  });
});

// Админ-панель - управление отзывами
app.get('/admin/reviews', requireAdmin, (req, res) => {
  const pendingReviews = reviews.filter(r => !r.approved);
  const approvedReviews = reviews.filter(r => r.approved);
  
  res.render('admin/reviews', {
    title: 'Управление отзывами',
    pendingReviews,
    approvedReviews,
    products
  });
});

app.post('/admin/reviews/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const review = reviews.find(r => r.id === id);
  if (review) {
    review.approved = true;
  }
  res.redirect('/admin/reviews');
});

app.post('/admin/reviews/:id/delete', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  reviews = reviews.filter(r => r.id !== id);
  res.redirect('/admin/reviews');
});

// Sitemap
app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Страница не найдена' });
});

// Error handler for multer and other errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).send('Файл слишком большой. Максимальный размер: 5 МБ');
    }
    return res.status(400).send('Ошибка загрузки файла: ' + err.message);
  }
  if (err) {
    console.error(err);
    return res.status(500).send('Произошла ошибка: ' + err.message);
  }
  next();
});

createDemoAdmin().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Asalchi Amin запущен на http://localhost:${PORT}`);
    console.log(`Для доступа с телефона: http://[IP-адрес]:${PORT}`);
  });
});

