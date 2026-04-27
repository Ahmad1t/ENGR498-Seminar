const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/trips — list user's trips (newest first)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, origin, destination, departure_date, return_date,
              passengers, trip_type, status, notes, offer_id, total_amount, currency, created_at
       FROM Trips
       WHERE user_id = @user_id
       ORDER BY created_at DESC`,
      { user_id: req.user.id }
    );
    res.json({ trips: result.recordset });
  } catch (err) {
    console.error('Get trips error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/trips — create a new trip
router.post(
  '/',
  authMiddleware,
  [
    body('title').trim().notEmpty().withMessage('Trip title is required'),
    body('origin').trim().notEmpty().withMessage('Origin is required'),
    body('destination').trim().notEmpty().withMessage('Destination is required'),
    body('departure_date').isISO8601().withMessage('Valid departure date is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const {
      title, origin, destination, departure_date, return_date,
      passengers, trip_type, notes, offer_id, total_amount, currency,
    } = req.body;

    try {
      const result = await query(
        `INSERT INTO Trips
           (user_id, title, origin, destination, departure_date, return_date,
            passengers, trip_type, notes, offer_id, total_amount, currency)
         OUTPUT INSERTED.*
         VALUES
           (@user_id, @title, @origin, @destination, @departure_date, @return_date,
            @passengers, @trip_type, @notes, @offer_id, @total_amount, @currency)`,
        {
          user_id: req.user.id,
          title,
          origin,
          destination,
          departure_date,
          return_date: return_date || null,
          passengers: passengers || 1,
          trip_type: trip_type || 'flight',
          notes: notes || null,
          offer_id: offer_id || null,
          total_amount: total_amount || null,
          currency: currency || null,
        }
      );
      res.status(201).json({ message: 'Trip saved!', trip: result.recordset[0] });
    } catch (err) {
      console.error('Create trip error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  }
);

// GET /api/trips/:id — get single trip (owner check)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM Trips WHERE id = @id AND user_id = @user_id`,
      { id: req.params.id, user_id: req.user.id }
    );
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }
    res.json({ trip: result.recordset[0] });
  } catch (err) {
    console.error('Get trip error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/trips/:id — update trip status or notes
router.patch('/:id', authMiddleware, async (req, res) => {
  const { status, notes, title } = req.body;
  const validStatuses = ['planned', 'booked', 'completed', 'cancelled'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    const check = await query(
      `SELECT id FROM Trips WHERE id = @id AND user_id = @user_id`,
      { id: req.params.id, user_id: req.user.id }
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }

    await query(
      `UPDATE Trips
       SET
         status = COALESCE(@status, status),
         notes = COALESCE(@notes, notes),
         title = COALESCE(@title, title),
         updated_at = GETDATE()
       WHERE id = @id AND user_id = @user_id`,
      {
        status: status || null,
        notes: notes || null,
        title: title || null,
        id: req.params.id,
        user_id: req.user.id,
      }
    );
    res.json({ message: 'Trip updated successfully!' });
  } catch (err) {
    console.error('Update trip error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/trips/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const check = await query(
      `SELECT id FROM Trips WHERE id = @id AND user_id = @user_id`,
      { id: req.params.id, user_id: req.user.id }
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }

    await query(
      `DELETE FROM Trips WHERE id = @id AND user_id = @user_id`,
      { id: req.params.id, user_id: req.user.id }
    );
    res.json({ message: 'Trip deleted.' });
  } catch (err) {
    console.error('Delete trip error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
