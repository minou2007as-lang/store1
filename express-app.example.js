require('dotenv').config();
const express = require('express');

const topUpRoutes = require('./routes/topUpRoutes');
const withdrawRoutes = require('./routes/withdrawRoutes');
const orderRoutes = require('./routes/orderRoutes');
const telegramRoutes = require('./routes/telegramRoutes');

const app = express();

app.use(express.json());

app.use('/api', topUpRoutes);
app.use('/api', withdrawRoutes);
app.use('/api', orderRoutes);
app.use('/api', telegramRoutes);

app.get('/api/health', (req, res) => {
  return res.status(200).json({ success: true, message: 'MOHSTORE Express API is running.' });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port}`);
});
