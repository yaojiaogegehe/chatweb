const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MongoDB连接
mongoose.connect('mongodb://localhost/chatapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB连接成功'))
.catch(err => console.error('MongoDB连接错误:', err));

// 定义消息模型
const Message = mongoose.model('Message', {
  name: String,
  content: String,
  timestamp: Date,
  fileUrl: String,
  fileType: String,
  fileName: String
});

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});
const upload = multer({ storage: storage });

// 中间件设置
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  next();
});

// 路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 文件上传路由
app.post('/upload', upload.single('file'), (req, res) => {
  if (req.file) {
    res.json({ 
      fileUrl: '/uploads/' + req.file.filename,
      originalName: req.file.originalname
    });
  } else {
    res.status(400).send('文件上传失败');
  }
});

// 保存聊天记录到文件
function saveChatLog(message) {
  const logDir = path.join(__dirname, 'memory');
  const logPath = path.join(logDir, 'chat_log.txt');
  
  if (!fs.existsSync(logDir)){
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logEntry = `${message.timestamp} - ${message.name}: ${message.content}\n`;
  fs.appendFile(logPath, logEntry, (err) => {
    if (err) console.error('保存聊天记录失败:', err);
  });
}

// Socket.io 处理
io.on('connection', (socket) => {
  console.log('新用户连接');

  Message.find().sort({timestamp: -1}).limit(50).exec()
    .then(messages => {
      socket.emit('load messages', messages.reverse());
    })
    .catch(err => console.error('读取历史消息错误:', err));

  socket.on('chat message', (msg) => {
    const message = new Message({
      name: msg.name,
      content: msg.content,
      timestamp: new Date(),
      fileUrl: msg.fileUrl,
      fileType: msg.fileType,
      fileName: msg.fileName
    });

    message.save()
      .then(savedMessage => {
        io.emit('chat message', savedMessage);
        saveChatLog(savedMessage);
      })
      .catch(err => console.error('保存消息错误:', err));
  });

  socket.on('disconnect', () => {
    console.log('用户断开连接');
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('服务器内部错误');
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://0.0.0.0:${PORT}`);
}).on('error', (err) => {
  console.error('启动服务器失败:', err);
});