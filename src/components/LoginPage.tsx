import { FormEvent, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import {
  getAuthRedirectUrl,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase';
import { FOODS } from '../data/foods';
import { Modal } from './Modal';

type Theme = 'light' | 'dark';
type ActiveModal = 'register' | 'forgot' | null;

interface LoginPageProps {
  theme: Theme;
  onToggleTheme: () => void;
  localMealItemsCount: number;
  recoveryMode: boolean;
  onRecoveryComplete: () => void;
}

interface PasswordStrength {
  minLength: boolean;
  hasLower: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
}

function validatePasswordStrength(password: string): PasswordStrength {
  return {
    minLength: password.length >= 8,
    hasLower: /[a-z]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
  };
}

function isPasswordStrong(strength: PasswordStrength): boolean {
  return (
    strength.minLength &&
    strength.hasLower &&
    strength.hasUpper &&
    strength.hasNumber
  );
}

function PasswordRulesList({ strength }: { strength: PasswordStrength }) {
  return (
    <ul className="password-rules" aria-label="Requisitos de senha">
      <li className={strength.minLength ? 'ok' : ''}>Mínimo de 8 caracteres</li>
      <li className={strength.hasLower ? 'ok' : ''}>
        Pelo menos 1 letra minúscula
      </li>
      <li className={strength.hasUpper ? 'ok' : ''}>
        Pelo menos 1 letra maiúscula
      </li>
      <li className={strength.hasNumber ? 'ok' : ''}>Pelo menos 1 número</li>
    </ul>
  );
}

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada ou spam).';
  }
  if (lower.includes('user already registered')) {
    return 'Já existe uma conta cadastrada com este e-mail.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Muitas tentativas seguidas. Aguarde um instante e tente novamente.';
  }
  if (
    lower.includes('password should be at least') ||
    lower.includes('weak') ||
    lower.includes('character of each')
  ) {
    return 'A senha precisa ter pelo menos 8 caracteres, incluindo minúscula, maiúscula e número.';
  }
  return message;
}

export function LoginPage({
  theme,
  onToggleTheme,
  localMealItemsCount,
  recoveryMode,
  onRecoveryComplete,
}: LoginPageProps) {
  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Modals state
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // Register modal state
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  // Forgot password modal state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  // Set new password modal state (PKCE recovery)
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const regStrength = useMemo(
    () => validatePasswordStrength(regPassword),
    [regPassword]
  );
  const resetStrength = useMemo(
    () => validatePasswordStrength(newPassword),
    [newPassword]
  );

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);

    if (!isSupabaseConfigured || !supabase) {
      setLoginError(
        'Autenticação ainda não conectada ao Supabase. Configure as chaves do projeto.'
      );
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLoginError('Preencha seu e-mail e senha.');
      return;
    }

    setLoginLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        setLoginError(mapAuthError(error.message));
      }
    } catch {
      setLoginError('Não foi possível conectar. Tente novamente.');
    } finally {
      setLoginLoading(false);
    }
  }

  function openRegisterModal() {
    setRegEmail(email.trim());
    setRegPassword('');
    setRegConfirm('');
    setRegError(null);
    setRegSuccess(null);
    setActiveModal('register');
  }

  function openForgotModal() {
    setForgotEmail(email.trim());
    setForgotError(null);
    setForgotSent(false);
    setActiveModal('forgot');
  }

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);

    if (!isSupabaseConfigured || !supabase) {
      setRegError(
        'Autenticação ainda não conectada ao Supabase. Configure as chaves do projeto.'
      );
      return;
    }

    const trimmedEmail = regEmail.trim();
    if (!trimmedEmail) {
      setRegError('Informe um e-mail válido.');
      return;
    }
    if (!isPasswordStrong(regStrength)) {
      setRegError(
        'A senha precisa ter 8+ caracteres com letra minúscula, maiúscula e número.'
      );
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError('As senhas não coincidem.');
      return;
    }

    setRegLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: regPassword,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (error) {
        setRegError(mapAuthError(error.message));
        return;
      }

      if (data.session) {
        setActiveModal(null);
      } else {
        setRegSuccess(
          'Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme por lá para entrar.'
        );
      }
    } catch {
      setRegError('Não foi possível criar a conta. Tente novamente.');
    } finally {
      setRegLoading(false);
    }
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault();
    setForgotError(null);

    if (!isSupabaseConfigured || !supabase) {
      setForgotError(
        'Autenticação ainda não conectada ao Supabase. Configure as chaves do projeto.'
      );
      return;
    }

    const trimmedEmail = forgotEmail.trim();
    if (!trimmedEmail) {
      setForgotError('Informe o e-mail da sua conta.');
      return;
    }

    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: getAuthRedirectUrl(),
      });
      if (error && error.message.toLowerCase().includes('rate limit')) {
        setForgotError(mapAuthError(error.message));
        return;
      }
      // Always display neutral message to avoid account enumeration
      setForgotSent(true);
    } catch {
      setForgotError('Não foi possível solicitar a recuperação agora.');
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleResetPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setResetError(null);

    if (!supabase) return;

    if (!isPasswordStrong(resetStrength)) {
      setResetError(
        'A senha precisa ter 8+ caracteres com letra minúscula, maiúscula e número.'
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setResetError('As senhas não coincidem.');
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        setResetError(mapAuthError(error.message));
        return;
      }
      onRecoveryComplete();
    } catch {
      setResetError('Não foi possível atualizar sua senha.');
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="login-page">
      <button
        type="button"
        className="theme-toggle login-theme-btn"
        onClick={onToggleTheme}
        aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
        title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
      >
        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>

      <div className="login-split">
        <div className="login-left">
          <div className="login-form-wrap">
            <h1 className="login-title">Bem-vinda de volta!</h1>
            <p className="login-subtitle">
              Organize os 15 dias da <strong>Fase 1</strong> com praticidade e
              mantenha suas refeições sincronizadas.
            </p>

            {localMealItemsCount > 0 && (
              <div className="login-sync-notice">
                <ShieldCheck size={16} className="login-sync-icon" />
                <span>
                  Você tem{' '}
                  <strong>
                    {localMealItemsCount}{' '}
                    {localMealItemsCount === 1
                      ? 'ingrediente salvo'
                      : 'ingredientes salvos'}
                  </strong>{' '}
                  neste aparelho. Ao entrar ou criar sua conta, eles serão migrados
                  automaticamente.
                </span>
              </div>
            )}

            <form className="login-form" onSubmit={handleLoginSubmit} noValidate>
              <input
                type="email"
                className="pill-input"
                placeholder="E-mail"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <div className="pill-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="pill-input has-icon-right"
                  placeholder="Senha"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="pill-eye-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
              </div>

              <div className="login-forgot-row">
                <button
                  type="button"
                  className="text-link-dark"
                  onClick={openForgotModal}
                >
                  Esqueceu a senha?
                </button>
              </div>

              {loginError && (
                <div className="form-feedback error" role="alert">
                  <AlertCircle size={15} />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                className="pill-submit-btn"
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>

            <div className="login-divider">
              <span>acesso seguro com e-mail</span>
            </div>

            <p className="login-footer-prompt">
              Ainda não tem conta?{' '}
              <button
                type="button"
                className="text-link-sage"
                onClick={openRegisterModal}
              >
                Criar conta
              </button>
            </p>
          </div>
        </div>

        <div className="login-right" aria-hidden="true">
          <div className="login-showcase-card">
            <div className="showcase-art">
              {/* Line-art + sage illustration featuring sliced avocado & low-carb foods */}
              <svg
                viewBox="0 0 320 260"
                className="zen-svg"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Organic looping sage swirl behind */}
                <path
                  d="M64 134 C56 88, 96 52, 120 74 C134 88, 118 104, 112 84 C104 54, 154 32, 180 50 C198 64, 182 86, 170 72 C156 54, 206 42, 232 70 C252 92, 234 118, 218 100 C206 86, 256 88, 254 138"
                  stroke="#8EC38B"
                  strokeWidth="2"
                  strokeLinecap="round"
                />

                {/* Top-left floating food badge: sliced lemon / citrus */}
                <circle
                  cx="54"
                  cy="68"
                  r="22"
                  fill="#C8E2C5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle
                  cx="54"
                  cy="68"
                  r="13"
                  fill="var(--surface)"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M54 55 L54 81 M41 68 L67 68 M45 59 L63 77 M63 59 L45 77"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                />
                <circle cx="54" cy="68" r="2.2" fill="#8EC38B" />

                {/* Right floating food badge: halved boiled egg */}
                <circle
                  cx="268"
                  cy="154"
                  r="23"
                  fill="var(--surface)"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M268 139 C261 139, 256 149, 256 157 C256 165, 261 169, 268 169 C275 169, 280 165, 280 157 C280 149, 275 139, 268 139 Z"
                  fill="var(--surface)"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle
                  cx="268"
                  cy="158"
                  r="6"
                  fill="#8EC38B"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />

                {/* Top-right delicate herb / rosemary sprig */}
                <path
                  d="M236 68 Q248 52 262 44"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M242 61 C238 53, 241 47, 246 47 C248 53, 246 58, 242 61 Z"
                  fill="#8EC38B"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path
                  d="M249 54 C256 54, 261 57, 260 62 C254 63, 250 59, 249 54 Z"
                  fill="#C8E2C5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path
                  d="M254 49 C251 42, 254 37, 259 38 C260 43, 258 47, 254 49 Z"
                  fill="#8EC38B"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />

                {/* Back avocado silhouette (subtle depth behind main half) */}
                <g transform="translate(182 118) rotate(14)">
                  <path
                    d="M0 -44 C15 -44, 24 -22, 30 0 C37 25, 25 50, 0 50 C-25 50, -37 25, -30 0 C-24 -22, -15 -44, 0 -44 Z"
                    fill="#C8E2C5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                  {/* Stem & small leaf */}
                  <path
                    d="M0 -44 C1 -52, 4 -56, 8 -58"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M3 -52 C11 -60, 21 -58, 22 -50 C14 -45, 7 -47, 3 -52 Z"
                    fill="#8EC38B"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </g>

                {/* Main Centerpiece: Avocado cut in half */}
                <g transform="translate(150 132) rotate(-12)">
                  {/* Outer skin */}
                  <path
                    d="M0 -58 C19 -58, 30 -30, 38 -2 C47 30, 32 62, 0 62 C-32 62, -47 30, -38 -2 C-30 -30, -19 -58, 0 -58 Z"
                    fill="var(--surface)"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinejoin="round"
                  />
                  {/* Creamy flesh */}
                  <path
                    d="M0 -50 C15 -50, 24 -26, 31 -1 C39 26, 26 54, 0 54 C-26 54, -39 26, -31 -1 C-24 -26, -15 -50, 0 -50 Z"
                    fill="#8EC38B"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  {/* Inner lighter flesh halo */}
                  <ellipse
                    cx="0"
                    cy="18"
                    rx="23"
                    ry="26"
                    fill="#C8E2C5"
                  />
                  {/* Avocado pit / seed */}
                  <circle
                    cx="0"
                    cy="20"
                    r="16.5"
                    fill="var(--surface)"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  {/* Pit subtle inner fill & highlight arc */}
                  <circle
                    cx="0"
                    cy="20"
                    r="12"
                    fill="currentColor"
                    opacity="0.88"
                  />
                  <path
                    d="M-5 13 A 8 8 0 0 1 6 14"
                    stroke="var(--surface)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </g>

                {/* Minimalist almonds / seeds accent at bottom-right */}
                <g transform="translate(216 206) rotate(-18)">
                  <path
                    d="M0 -8 C7 -5, 9 4, 0 9 C-9 4, -7 -5, 0 -8 Z"
                    fill="#C8E2C5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </g>
                <g transform="translate(234 214) rotate(22)">
                  <path
                    d="M0 -7 C6 -4, 7 3, 0 8 C-7 3, -6 -4, 0 -7 Z"
                    fill="var(--surface)"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </g>
              </svg>

              {/* Floating static info card: Dieta Low Carb + total de alimentos */}
              <div className="floating-preview-card">
                <div className="preview-title">Dieta Low Carb</div>
                <div className="preview-meta">
                  <span className="preview-sage-dot" />
                  <span>{FOODS.length} alimentos</span>
                </div>
              </div>
            </div>

            <p className="showcase-tagline">
              Organize suas refeições de forma leve com o <strong>Guia Fase 1</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Criar conta */}
      <Modal
        open={activeModal === 'register'}
        title="Criar conta"
        subtitle="Cadastre seu e-mail e senha para salvar e sincronizar suas refeições."
        onClose={() => setActiveModal(null)}
      >
        {regSuccess ? (
          <div className="modal-success-box">
            <CheckCircle2 size={22} className="success-icon" />
            <p>{regSuccess}</p>
            <button
              type="button"
              className="pill-submit-btn"
              onClick={() => setActiveModal(null)}
            >
              Voltar ao login
            </button>
          </div>
        ) : (
          <form className="modal-form" onSubmit={handleRegisterSubmit} noValidate>
            <input
              type="email"
              className="pill-input"
              placeholder="Seu melhor e-mail"
              autoComplete="email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
            />

            <div className="pill-input-wrap">
              <input
                type={showRegPassword ? 'text' : 'password'}
                className="pill-input has-icon-right"
                placeholder="Crie uma senha"
                autoComplete="new-password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
              <button
                type="button"
                className="pill-eye-btn"
                onClick={() => setShowRegPassword((prev) => !prev)}
                aria-label={showRegPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showRegPassword ? <Eye size={17} /> : <EyeOff size={17} />}
              </button>
            </div>

            <input
              type={showRegPassword ? 'text' : 'password'}
              className="pill-input"
              placeholder="Confirmar senha"
              autoComplete="new-password"
              value={regConfirm}
              onChange={(e) => setRegConfirm(e.target.value)}
            />

            <PasswordRulesList strength={regStrength} />

            {regError && (
              <div className="form-feedback error" role="alert">
                <AlertCircle size={15} />
                <span>{regError}</span>
              </div>
            )}

            <button
              type="submit"
              className="pill-submit-btn"
              disabled={regLoading}
            >
              {regLoading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Criando conta...
                </>
              ) : (
                'Criar conta'
              )}
            </button>
          </form>
        )}
      </Modal>

      {/* Modal: Recuperar senha */}
      <Modal
        open={activeModal === 'forgot'}
        title="Recuperar senha"
        subtitle="Informe o e-mail cadastrado. Enviaremos um link seguro para redefinir sua senha."
        onClose={() => setActiveModal(null)}
      >
        {forgotSent ? (
          <div className="modal-success-box">
            <CheckCircle2 size={22} className="success-icon" />
            <p>
              Se este e-mail estiver cadastrado, você receberá um link de
              recuperação em instantes. Confira também a caixa de spam.
            </p>
            <button
              type="button"
              className="pill-submit-btn"
              onClick={() => setActiveModal(null)}
            >
              Entendi
            </button>
          </div>
        ) : (
          <form className="modal-form" onSubmit={handleForgotSubmit} noValidate>
            <input
              type="email"
              className="pill-input"
              placeholder="E-mail cadastrado"
              autoComplete="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />

            {forgotError && (
              <div className="form-feedback error" role="alert">
                <AlertCircle size={15} />
                <span>{forgotError}</span>
              </div>
            )}

            <button
              type="submit"
              className="pill-submit-btn"
              disabled={forgotLoading}
            >
              {forgotLoading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Enviando link...
                </>
              ) : (
                'Enviar link de recuperação'
              )}
            </button>
          </form>
        )}
      </Modal>

      {/* Modal: Definir nova senha (após clicar no link do e-mail) */}
      <Modal
        open={recoveryMode}
        title="Definir nova senha"
        subtitle="Escolha uma nova senha segura para acessar sua conta."
        closeDisabled
      >
        <form className="modal-form" onSubmit={handleResetPasswordSubmit} noValidate>
          <div className="pill-input-wrap">
            <input
              type={showNewPassword ? 'text' : 'password'}
              className="pill-input has-icon-right"
              placeholder="Nova senha"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button
              type="button"
              className="pill-eye-btn"
              onClick={() => setShowNewPassword((prev) => !prev)}
              aria-label={showNewPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showNewPassword ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>
          </div>

          <input
            type={showNewPassword ? 'text' : 'password'}
            className="pill-input"
            placeholder="Confirmar nova senha"
            autoComplete="new-password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
          />

          <PasswordRulesList strength={resetStrength} />

          {resetError && (
            <div className="form-feedback error" role="alert">
              <AlertCircle size={15} />
              <span>{resetError}</span>
            </div>
          )}

          <button
            type="submit"
            className="pill-submit-btn"
            disabled={resetLoading}
          >
            {resetLoading ? (
              <>
                <Loader2 size={16} className="spin" />
                Salvando...
              </>
            ) : (
              'Salvar nova senha'
            )}
          </button>
        </form>
      </Modal>
    </div>
  );
}
