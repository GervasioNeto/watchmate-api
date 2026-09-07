import { UsuarioAutenticado } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}
