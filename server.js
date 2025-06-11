require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting configuration
const rateLimit = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5 // limit each IP to 5 requests per windowMs
};

// Middleware
app.use(cors());
app.use(express.json());

// Custom rate limiting middleware
app.use('/api/contact', (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    if (!global.rateLimit) global.rateLimit = {};
    if (!global.rateLimit[ip]) {
        global.rateLimit[ip] = { count: 0, resetTime: now + rateLimit.windowMs };
    }
    if (now > global.rateLimit[ip].resetTime) {
        global.rateLimit[ip] = { count: 0, resetTime: now + rateLimit.windowMs };
    }
    global.rateLimit[ip].count++;
    if (global.rateLimit[ip].count > rateLimit.max) {
        return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }
    next();
});
app.use(express.static('.'));

// Email transporter configuration
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Validation middleware
const validateContactForm = [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('projectType').trim().notEmpty().withMessage('Project type is required'),
    body('message').trim().notEmpty().withMessage('Message is required')
];

// Contact form endpoint
// Verify email configuration middleware
const verifyEmailConfig = (req, res, next) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ message: 'Email service not properly configured' });
    }
    next();
};

app.post('/api/contact', validateContactForm, verifyEmailConfig, async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, projectType, message } = req.body;

    try {
        // Email to site owner
        await transporter.sendMail({
            from: process.env.EMAIL_USER || 'wilsvlogger.outlook@gmail.com',
            to: process.env.EMAIL_USER || 'wilsvlogger.outlook@gmail.com',
            subject: `New Project Inquiry: ${projectType}`,
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Project Type:</strong> ${projectType}</p>
                <p><strong>Message:</strong></p>
                <p>${message}</p>
            `
        });

        // Auto-reply to client
        await transporter.sendMail({
            from: process.env.EMAIL_USER || 'wilsvlogger.outlook@gmail.com',
            to: email,
            subject: 'Thank you for your inquiry!',
            html: `
                <h2>Thank you for reaching out!</h2>
                <p>Hi ${name},</p>
                <p>I've received your message about the ${projectType} project. I'll review your inquiry and get back to you within 24-48 hours.</p>
                <p>Best regards,<br>Wils</p>
            `
        });

        res.status(200).json({ message: 'Message sent successfully!' });
    } catch (error) {
        console.error('Email error:', error);
        let errorMessage = 'Failed to send message. Please try again.';
        if (error.code === 'EAUTH') {
            errorMessage = 'Email authentication failed. Please contact administrator.';
        } else if (error.code === 'ESOCKET') {
            errorMessage = 'Network error. Please check your connection and try again.';
        }
        res.status(500).json({ message: errorMessage, error: error.code });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});