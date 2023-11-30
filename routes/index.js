const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.send('This is the INTUITION API, used by the frontend.');
});

module.exports = router;
