const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'mafia-uz-secret-key-2024';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ===== IN-MEMORY DATABASE =====
const db = {
  users: [],
  rooms: {},
  bannedIPs: new Set(),
  stats: { totalGames: 0, totalUsers: 0 }
};

// ===== RANKS CONFIGURATION =====
const RANKS = {
  oddiy: {
    name: 'Oddiy',
    nameUz: '👤 Oddiy',
    price: 0,
    color: '#9ca3af',
    abilities: ['Asosiy o\'yin'],
    maxRooms: 1,
    badgeStyle: 'gray'
  },
  vip: {
    name: 'VIP',
    nameUz: '⭐ VIP',
    price: 5000,
    color: '#f59e0b',
    abilities: ['Maxsus VIP avatar', 'Xona yaratish (3 ta)', 'VIP chat rangı', 'Tez ulanish'],
    maxRooms: 3,
    badgeStyle: 'gold',
    badge: '⭐'
  },
  pro: {
    name: 'PRO',
    nameUz: '💎 PRO',
    price: 15000,
    color: '#3b82f6',
    abilities: ['VIP imkoniyatlari', 'Xona yaratish (5 ta)', 'O\'yin statistikasi', 'Maxsus rol tanlash', 'Animatsiyali avatar'],
    maxRooms: 5,
    badgeStyle: 'blue',
    badge: '💎'
  },
  max: {
    name: 'MAX',
    nameUz: '🔥 MAX',
    price: 35000,
    color: '#ef4444',
    abilities: ['PRO imkoniyatlari', 'Cheksiz xona', 'Maxsus karta dizayni', 'Xususiy xona paroli', 'O\'yin boshqarish', 'Animatsiyali ism'],
    maxRooms: 10,
    badgeStyle: 'red',
    badge: '🔥'
  },
  ultimate: {
    name: 'ULTIMATE',
    nameUz: '👑 ULTIMATE',
    price: 75000,
    color: '#8b5cf6',
    abilities: ['MAX imkoniyatlari', 'Cheksiz hamma narsa', 'Maxsus effektlar', 'Admin panel kirish', 'Reklama yo\'q', 'Global chat moderatsiya', 'Maxsus server'],
    maxRooms: 999,
    badgeStyle: 'purple',
    badge: '👑'
  }
};

// ===== GAME ROLES =====
const ROLES = {
  CITIZEN: { name: 'Fuqaro', icon: '👨', team: 'citizen', description: 'Mafianing kimligini toping!' },
  MAFIA: { name: 'Mafiya', icon: '🔫', team: 'mafia', description: 'Fuqarolarni yo\'q qiling!' },
  DETECTIVE: { name: 'Detektiv', icon: '🔍', team: 'citizen', description: 'Har kechada birini tekshiring!' },
  DOCTOR: { name: 'Doktor', icon: '💊', team: 'citizen', description: 'Har kechada birini davolang!' },
  DON: { name: 'Don', icon: '💀', team: 'mafia', description: 'Mafiya boshlig\'i - kuchliroq!' }
};

// ===== UTILITY FUNCTIONS =====
function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, rank: user.rank, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

function findUser(id) { return db.users.find(u => u.id === id); }
function findUserByName(username) { return db.users.find(u => u.username.toLowerCase() === username.toLowerCase()); }

function assignRoles(players) {
  const count = players.length;
  const roles = [];
  
  const mafiaCount = Math.floor(count / 4) || 1;
  for (let i = 0; i < mafiaCount; i++) {
    roles.push(i === 0 ? 'DON' : 'MAFIA');
  }
  if (count >= 5) roles.push('DETECTIVE');
  if (count >= 6) roles.push('DOCTOR');
  while (roles.length < count) roles.push('CITIZEN');

  // Shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

function checkWinCondition(room) {
  const alive = room.players.filter(p => p.alive);
  const mafiaAlive = alive.filter(p => ['MAFIA', 'DON'].includes(p.role));
  const citizenAlive = alive.filter(p => !['MAFIA', 'DON'].includes(p.role));
  
  if (mafiaAlive.length === 0) return 'citizen';
  if (mafiaAlive.length >= citizenAlive.length) return 'mafia';
  return null;
}

// ===== AUTH ROUTES =====
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username va parol kerak' });
  if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username 3-20 harf bo\'lishi kerak' });
  if (findUserByName(username)) return res.status(400).json({ error: 'Bu username band' });
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  const user = {
    id: uuidv4(),
    username,
    password: hashedPassword,
    rank: 'oddiy',
    rankExpiry: null,
    isAdmin: false,
    createdAt: new Date(),
    stats: { gamesPlayed: 0, wins: 0, losses: 0 },
    friends: [],
    avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${username}`,
    banned: false
  };
  
  db.users.push(user);
  db.stats.totalUsers++;
  const token = generateToken(user);
  res.json({ token, user: { ...user, password: undefined } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = findUserByName(username);
  if (!user) return res.status(400).json({ error: 'Foydalanuvchi topilmadi' });
  if (user.banned) return res.status(403).json({ error: 'Sizning akkauntingiz bloklangan' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Parol noto\'g\'ri' });
  
  const token = generateToken(user);
  res.json({ token, user: { ...user, password: undefined } });
});

app.get('/api/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Token noto\'g\'ri' });
  const user = findUser(decoded.id);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  res.json({ ...user, password: undefined });
});

// ===== RANKS ROUTES =====
app.get('/api/ranks', (req, res) => {
  res.json(RANKS);
});

app.post('/api/buy-rank', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Login qiling' });
  
  const { rank } = req.body;
  if (!RANKS[rank] || rank === 'oddiy') return res.status(400).json({ error: 'Noto\'g\'ri rank' });
  
  const user = findUser(decoded.id);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  
  // In production, payment gateway integration here
  user.rank = rank;
  user.rankExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  const newToken = generateToken(user);
  res.json({ success: true, message: `${RANKS[rank].nameUz} rank muvaffaqiyatli faollashtirildi!`, token: newToken, user: { ...user, password: undefined } });
});

// ===== ADMIN ROUTES =====
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Parol noto\'g\'ri' });
  const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '1d' });
  res.json({ token });
});

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded?.isAdmin) return res.status(403).json({ error: 'Admin huquqi yo\'q' });
  next();
}

app.get('/api/admin/stats', adminAuth, (req, res) => {
  res.json({
    totalUsers: db.users.length,
    totalRooms: Object.keys(db.rooms).length,
    activeRooms: Object.values(db.rooms).filter(r => r.status === 'playing').length,
    totalGames: db.stats.totalGames,
    rankDistribution: {
      oddiy: db.users.filter(u => u.rank === 'oddiy').length,
      vip: db.users.filter(u => u.rank === 'vip').length,
      pro: db.users.filter(u => u.rank === 'pro').length,
      max: db.users.filter(u => u.rank === 'max').length,
      ultimate: db.users.filter(u => u.rank === 'ultimate').length
    }
  });
});

app.get('/api/admin/users', adminAuth, (req, res) => {
  res.json(db.users.map(u => ({ ...u, password: undefined })));
});

app.post('/api/admin/ban-user', adminAuth, (req, res) => {
  const { userId, banned } = req.body;
  const user = findUser(userId);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  user.banned = banned;
  res.json({ success: true, message: banned ? 'Bloklandi' : 'Blok olib tashlandi' });
});

app.post('/api/admin/set-rank', adminAuth, (req, res) => {
  const { userId, rank } = req.body;
  const user = findUser(userId);
  if (!user) return res.status(404).json({ error: 'Topilmadi' });
  user.rank = rank;
  user.rankExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  res.json({ success: true });
});

app.delete('/api/admin/delete-user', adminAuth, (req, res) => {
  const { userId } = req.body;
  db.users = db.users.filter(u => u.id !== userId);
  res.json({ success: true });
});

app.get('/api/admin/rooms', adminAuth, (req, res) => {
  res.json(Object.values(db.rooms));
});

// ===== ROOMS API =====
app.get('/api/rooms', (req, res) => {
  const publicRooms = Object.values(db.rooms)
    .filter(r => !r.private && r.status === 'waiting')
    .map(r => ({
      id: r.id, name: r.name, host: r.host,
      players: r.players.length, maxPlayers: r.maxPlayers,
      status: r.status, hasPassword: !!r.password
    }));
  res.json(publicRooms);
});

// ===== FRIENDS =====
app.post('/api/friends/add', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Login qiling' });
  
  const { friendUsername } = req.body;
  const user = findUser(decoded.id);
  const friend = findUserByName(friendUsername);
  
  if (!friend) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  if (user.friends.includes(friend.id)) return res.status(400).json({ error: 'Allaqachon do\'st' });
  if (friend.id === user.id) return res.status(400).json({ error: 'O\'zingizni qo\'sha olmaysiz' });
  
  user.friends.push(friend.id);
  res.json({ success: true, message: `${friend.username} do\'stlar ro\'yxatiga qo\'shildi!` });
});

app.get('/api/friends', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Login qiling' });
  
  const user = findUser(decoded.id);
  const friends = user.friends.map(id => {
    const f = findUser(id);
    return f ? { id: f.id, username: f.username, rank: f.rank, online: f.online || false } : null;
  }).filter(Boolean);
  
  res.json(friends);
});

// ===== SERVE PAGES =====
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ===== SOCKET.IO GAME LOGIC =====
const connectedUsers = {};

io.on('connection', (socket) => {
  console.log('Yangi ulanish:', socket.id);

  socket.on('authenticate', (token) => {
    const decoded = verifyToken(token);
    if (!decoded) { socket.emit('auth_error', 'Token noto\'g\'ri'); return; }
    const user = findUser(decoded.id);
    if (!user || user.banned) { socket.emit('auth_error', 'Kirish taqiqlangan'); return; }
    
    user.online = true;
    user.socketId = socket.id;
    connectedUsers[socket.id] = user.id;
    socket.userId = user.id;
    socket.emit('authenticated', { ...user, password: undefined });
    
    // Online count
    io.emit('online_count', Object.keys(connectedUsers).length);
  });

  socket.on('create_room', (data) => {
    const user = findUser(socket.userId);
    if (!user) return;
    
    const rankConfig = RANKS[user.rank];
    const userRooms = Object.values(db.rooms).filter(r => r.hostId === user.id).length;
    if (userRooms >= rankConfig.maxRooms) {
      socket.emit('error', `Sizning rankingiz uchun maksimal xona soni: ${rankConfig.maxRooms}`);
      return;
    }
    
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const room = {
      id: roomId,
      name: data.name || `${user.username}ning xonasi`,
      host: user.username,
      hostId: user.id,
      password: data.password || null,
      private: data.private || false,
      maxPlayers: Math.min(Math.max(data.maxPlayers || 6, 4), 12),
      players: [],
      status: 'waiting',
      phase: null,
      votes: {},
      nightActions: {},
      chat: [],
      round: 0
    };
    
    db.rooms[roomId] = room;
    socket.emit('room_created', { roomId });
    io.emit('rooms_updated', getRoomsList());
  });

  socket.on('join_room', (data) => {
    const { roomId, password } = data;
    const user = findUser(socket.userId);
    if (!user) return;
    
    const room = db.rooms[roomId];
    if (!room) { socket.emit('error', 'Xona topilmadi'); return; }
    if (room.status === 'playing') { socket.emit('error', 'O\'yin boshlangan'); return; }
    if (room.players.length >= room.maxPlayers) { socket.emit('error', 'Xona to\'liq'); return; }
    if (room.password && room.password !== password) { socket.emit('error', 'Parol noto\'g\'ri'); return; }
    if (room.players.find(p => p.id === user.id)) { socket.emit('error', 'Allaqachon xonasiz'); return; }
    
    const player = {
      id: user.id, username: user.username, rank: user.rank,
      socketId: socket.id, alive: true, role: null,
      avatar: user.avatar, ready: false
    };
    
    room.players.push(player);
    socket.join(roomId);
    socket.currentRoom = roomId;
    
    socket.emit('joined_room', room);
    io.to(roomId).emit('room_updated', room);
    io.to(roomId).emit('game_message', { type: 'info', text: `${user.username} xonaga kirdi!` });
    io.emit('rooms_updated', getRoomsList());
  });

  socket.on('leave_room', () => {
    leaveRoom(socket);
  });

  socket.on('toggle_ready', () => {
    const user = findUser(socket.userId);
    if (!user || !socket.currentRoom) return;
    const room = db.rooms[socket.currentRoom];
    if (!room) return;
    
    const player = room.players.find(p => p.id === user.id);
    if (player) {
      player.ready = !player.ready;
      io.to(socket.currentRoom).emit('room_updated', room);
    }
  });

  socket.on('start_game', () => {
    const user = findUser(socket.userId);
    if (!user || !socket.currentRoom) return;
    const room = db.rooms[socket.currentRoom];
    if (!room || room.hostId !== user.id) return;
    if (room.players.length < 4) { socket.emit('error', 'Kamida 4 o\'yinchi kerak!'); return; }
    
    startGame(room);
  });

  socket.on('vote', (targetId) => {
    const user = findUser(socket.userId);
    if (!user || !socket.currentRoom) return;
    const room = db.rooms[socket.currentRoom];
    if (!room || room.phase !== 'day_vote') return;
    
    const player = room.players.find(p => p.id === user.id);
    if (!player || !player.alive) return;
    
    room.votes[user.id] = targetId;
    io.to(socket.currentRoom).emit('vote_update', room.votes);
    
    const alivePlayers = room.players.filter(p => p.alive);
    if (Object.keys(room.votes).length >= alivePlayers.length) {
      processVotes(room);
    }
  });

  socket.on('night_action', (targetId) => {
    const user = findUser(socket.userId);
    if (!user || !socket.currentRoom) return;
    const room = db.rooms[socket.currentRoom];
    if (!room || room.phase !== 'night') return;
    
    const player = room.players.find(p => p.id === user.id);
    if (!player || !player.alive) return;
    
    room.nightActions[player.role] = { actorId: user.id, targetId };
    socket.emit('action_confirmed', 'Harakatingiz qayd etildi');
    
    // Check if all special roles acted
    checkNightEnd(room);
  });

  socket.on('chat_message', (message) => {
    const user = findUser(socket.userId);
    if (!user || !socket.currentRoom) return;
    const room = db.rooms[socket.currentRoom];
    if (!room) return;
    
    const player = room.players.find(p => p.id === user.id);
    
    // During game, dead players can't send to living
    if (room.status === 'playing' && player && !player.alive) {
      socket.emit('game_message', { type: 'info', text: 'O\'liklar gapira olmaydi!' });
      return;
    }
    
    // Mafia can chat with each other at night
    if (room.phase === 'night' && player && ['MAFIA', 'DON'].includes(player.role)) {
      io.to(socket.currentRoom).emit('mafia_chat', {
        from: user.username, rank: user.rank, message: message.substring(0, 200)
      });
      return;
    }
    
    if (room.phase === 'night' && player && player.alive) {
      socket.emit('game_message', { type: 'info', text: 'Kechasi gapira olmaysiz!' });
      return;
    }
    
    const chatMsg = {
      id: uuidv4(), from: user.username, rank: user.rank,
      message: message.substring(0, 200), timestamp: new Date()
    };
    room.chat.push(chatMsg);
    if (room.chat.length > 100) room.chat.shift();
    
    io.to(socket.currentRoom).emit('chat_message', chatMsg);
  });

  socket.on('send_friend_invite', (data) => {
    const { friendId, roomId } = data;
    const friend = findUser(friendId);
    if (friend && friend.socketId) {
      const user = findUser(socket.userId);
      io.to(friend.socketId).emit('friend_invite', {
        from: user.username, fromId: user.id, roomId
      });
    }
  });

  socket.on('disconnect', () => {
    const user = findUser(socket.userId);
    if (user) {
      user.online = false;
      user.socketId = null;
    }
    delete connectedUsers[socket.id];
    leaveRoom(socket);
    io.emit('online_count', Object.keys(connectedUsers).length);
  });
});

// ===== GAME FUNCTIONS =====
function startGame(room) {
  room.status = 'playing';
  room.round = 1;
  
  const roles = assignRoles(room.players);
  room.players.forEach((p, i) => {
    p.role = roles[i];
    p.alive = true;
    p.ready = false;
  });
  
  db.stats.totalGames++;
  
  io.to(room.id).emit('game_started', { message: 'O\'yin boshlandi!' });
  
  // Send each player their role privately
  room.players.forEach(p => {
    const role = ROLES[p.role];
    io.to(p.socketId).emit('your_role', {
      role: p.role, roleInfo: role,
      teammates: ['MAFIA', 'DON'].includes(p.role) 
        ? room.players.filter(x => ['MAFIA', 'DON'].includes(x.role) && x.id !== p.id).map(x => x.username)
        : []
    });
  });
  
  startDiscussionPhase(room);
}

function startDiscussionPhase(room) {
  room.phase = 'discussion';
  room.votes = {};
  
  io.to(room.id).emit('phase_change', {
    phase: 'discussion',
    message: `🌅 Kun ${room.round} - Muhokama bosqichi (2 daqiqa)`,
    duration: 120
  });
  
  setTimeout(() => {
    if (db.rooms[room.id] && room.phase === 'discussion') {
      startVotePhase(room);
    }
  }, 120000);
}

function startVotePhase(room) {
  room.phase = 'day_vote';
  
  io.to(room.id).emit('phase_change', {
    phase: 'day_vote',
    message: '🗳️ Ovoz berish bosqichi! Kim chiqarilsin?',
    duration: 30,
    alivePlayers: room.players.filter(p => p.alive).map(p => ({ id: p.id, username: p.username, rank: p.rank }))
  });
  
  setTimeout(() => {
    if (db.rooms[room.id] && room.phase === 'day_vote') {
      processVotes(room);
    }
  }, 30000);
}

function processVotes(room) {
  const voteCounts = {};
  Object.values(room.votes).forEach(targetId => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
  });
  
  let maxVotes = 0, eliminated = null;
  Object.entries(voteCounts).forEach(([id, count]) => {
    if (count > maxVotes) { maxVotes = count; eliminated = id; }
  });
  
  if (eliminated) {
    const player = room.players.find(p => p.id === eliminated);
    if (player) {
      player.alive = false;
      io.to(room.id).emit('player_eliminated', {
        playerId: eliminated, username: player.username,
        role: ROLES[player.role], voteCounts
      });
    }
  } else {
    io.to(room.id).emit('game_message', { type: 'info', text: 'Ovozlar teng taqsimlandi, hech kim chiqarilmadi.' });
  }
  
  const winner = checkWinCondition(room);
  if (winner) { endGame(room, winner); return; }
  
  startNightPhase(room);
}

function startNightPhase(room) {
  room.phase = 'night';
  room.nightActions = {};
  room.round++;
  
  io.to(room.id).emit('phase_change', {
    phase: 'night',
    message: '🌙 Kecha tushdi... Hamma ko\'zini yumsin!',
    duration: 30
  });
  
  // Notify special roles
  room.players.filter(p => p.alive && ['MAFIA', 'DON', 'DETECTIVE', 'DOCTOR'].includes(p.role)).forEach(p => {
    io.to(p.socketId).emit('night_action_required', {
      role: p.role,
      targets: room.players.filter(t => t.alive && t.id !== p.id).map(t => ({ id: t.id, username: t.username }))
    });
  });
  
  setTimeout(() => {
    if (db.rooms[room.id] && room.phase === 'night') {
      processNightActions(room);
    }
  }, 30000);
}

function checkNightEnd(room) {
  const specialRoles = room.players.filter(p => p.alive && ['MAFIA', 'DON', 'DETECTIVE', 'DOCTOR'].includes(p.role));
  const required = new Set();
  
  if (specialRoles.some(p => ['MAFIA', 'DON'].includes(p.role))) required.add('MAFIA').add('DON');
  if (specialRoles.some(p => p.role === 'DETECTIVE')) required.add('DETECTIVE');
  if (specialRoles.some(p => p.role === 'DOCTOR')) required.add('DOCTOR');
  
  const acted = new Set(Object.keys(room.nightActions));
  const allActed = [...required].every(r => acted.has(r));
  
  if (allActed) processNightActions(room);
}

function processNightActions(room) {
  room.phase = 'night_result';
  
  const mafiaTarget = room.nightActions['MAFIA']?.targetId || room.nightActions['DON']?.targetId;
  const doctorSave = room.nightActions['DOCTOR']?.targetId;
  const detectiveCheck = room.nightActions['DETECTIVE']?.targetId;
  
  const results = [];
  
  if (mafiaTarget && mafiaTarget !== doctorSave) {
    const victim = room.players.find(p => p.id === mafiaTarget);
    if (victim && victim.alive) {
      victim.alive = false;
      results.push({ type: 'kill', username: victim.username, role: ROLES[victim.role] });
    }
  } else if (mafiaTarget && mafiaTarget === doctorSave) {
    results.push({ type: 'saved', message: 'Doktor kimnidir qutqardi!' });
  }
  
  if (detectiveCheck) {
    const suspect = room.players.find(p => p.id === detectiveCheck);
    if (suspect) {
      const detective = room.players.find(p => p.role === 'DETECTIVE' && p.alive);
      if (detective) {
        io.to(detective.socketId).emit('detective_result', {
          username: suspect.username,
          isMafia: ['MAFIA', 'DON'].includes(suspect.role)
        });
      }
    }
  }
  
  io.to(room.id).emit('night_results', results);
  
  const winner = checkWinCondition(room);
  if (winner) { setTimeout(() => endGame(room, winner), 3000); return; }
  
  setTimeout(() => {
    if (db.rooms[room.id]) startDiscussionPhase(room);
  }, 5000);
}

function endGame(room, winner) {
  room.status = 'finished';
  
  const winners = room.players.filter(p => {
    if (winner === 'mafia') return ['MAFIA', 'DON'].includes(p.role);
    return !['MAFIA', 'DON'].includes(p.role);
  });
  
  io.to(room.id).emit('game_over', {
    winner,
    winnerTeam: winner === 'mafia' ? '🔫 Mafiya g\'alaba qozondi!' : '👮 Fuqarolar g\'alaba qozondi!',
    players: room.players.map(p => ({ ...p, role: ROLES[p.role] })),
    winners: winners.map(p => p.username)
  });
  
  // Update stats
  room.players.forEach(p => {
    const user = findUser(p.id);
    if (user) {
      user.stats.gamesPlayed++;
      if (winners.find(w => w.id === p.id)) user.stats.wins++;
      else user.stats.losses++;
    }
  });
  
  // Clean up after 30 seconds
  setTimeout(() => {
    delete db.rooms[room.id];
    io.emit('rooms_updated', getRoomsList());
  }, 30000);
}

function leaveRoom(socket) {
  if (!socket.currentRoom) return;
  const room = db.rooms[socket.currentRoom];
  if (!room) return;
  
  const user = findUser(socket.userId);
  const playerIndex = room.players.findIndex(p => p.id === socket.userId);
  
  if (playerIndex !== -1) {
    const username = room.players[playerIndex].username;
    room.players.splice(playerIndex, 1);
    
    socket.leave(socket.currentRoom);
    io.to(socket.currentRoom).emit('game_message', { type: 'warning', text: `${username} xonadan chiqdi` });
    
    if (room.players.length === 0) {
      delete db.rooms[socket.currentRoom];
    } else if (room.hostId === socket.userId) {
      room.hostId = room.players[0].id;
      room.host = room.players[0].username;
      io.to(socket.currentRoom).emit('game_message', { type: 'info', text: `${room.players[0].username} yangi xona egasi!` });
    }
    
    io.to(socket.currentRoom).emit('room_updated', room);
    io.emit('rooms_updated', getRoomsList());
  }
  
  socket.currentRoom = null;
}

function getRoomsList() {
  return Object.values(db.rooms)
    .filter(r => !r.private)
    .map(r => ({
      id: r.id, name: r.name, host: r.host,
      players: r.players.length, maxPlayers: r.maxPlayers,
      status: r.status, hasPassword: !!r.password
    }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Mafia O'yin Serveri port ${PORT} da ishlamoqda`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔐 Admin panel: http://localhost:${PORT}/admin`);
});
