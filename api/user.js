const express = require('express');
const Router = express.Router();

Router.get('/user', async (req, res) => {
  return res.status(200).json({ message: 'User route is working!' });
});

module.exports = { Router };