import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function generateToken(userId: string, email: string, role: string, name: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return jwt.sign({ id: userId, email, role, name }, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as string,
  });
}

// POST /api/auth/login
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Email and password are required' });
    return;
  }
  const { email, password } = parsed.data;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive) {
    res.status(401).json({ success: false, message: 'Invalid email or password' });
    return;
  }
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    res.status(401).json({ success: false, message: 'Invalid email or password' });
    return;
  }
  const token = generateToken(String(user._id), user.email, user.role, user.name);
  res.json({
    success: true,
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
}));

// GET /api/auth/me
router.get('/me', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.id).select('-passwordHash');
  if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
  res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
}));

export default router;
