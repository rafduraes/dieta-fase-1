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

const SLIDES = [
  {
    tag: 'Low Carb',
    title: 'Dieta Fase 1',
    meta: '343 Alimentos',
    percent: 100,
    captionPrefix: 'Consulte e monte seu cardápio com ',
    captionBold: 'Guia Fase 1',
  },
  {
    tag: 'Sincronizado',
    title: 'Celular & PC',
    meta: 'Tempo real',
    percent: 84,
    captionPrefix: 'Suas refeições sempre salvas entre ',
    captionBold: 'todos os aparelhos',
  },
  {
    tag: 'Regra do dia',
    title: '1 Moderado/dia',
    meta: 'Alerta ativo',
    percent: 68,
    captionPrefix: 'Foque nos 15 dias sem dúvidas com ',
    captionBold: 'filtros rápidos',
  },
];

function validatePasswordStrength(password: string) {
  return {
    minLength: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasNumber: /\d/.test(password),
  };
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
  if (lower.includes('password should be at least')) {
    return 'A senha precisa ter pelo menos 8 caracteres.';
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
  const [slideIndex, setSlideIndex] = useState(0);

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

  const currentSlide = SLIDES[slideIndex];

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
    if (!regStrength.minLength || !regStrength.hasLetter || !regStrength.hasNumber) {
      setRegError('Use pelo menos 8 caracteres com letras e números.');
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

    if (
      !resetStrength.minLength ||
      !resetStrength.hasLetter ||
      !resetStrength.hasNumber
    ) {
      setResetError('Use pelo menos 8 caracteres com letras e números.');
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

  const circleRadius = 18;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset =
    circumference - (currentSlide.percent / 100) * circumference;

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
              {/* Calm Zen Wellness SVG Illustration inspired by Dribbble reference */}
              <svg
                viewBox="0 0 320 260"
                className="zen-svg"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Aura looping line */}
                <path
                  d="M72 128 C66 86, 102 52, 122 72 C136 86, 118 102, 114 82 C108 54, 152 34, 174 52 C192 66, 176 86, 166 72 C154 54, 198 42, 224 68 C244 88, 228 112, 214 96 C204 84, 248 84, 248 128"
                  stroke="#8EC38B"
                  strokeWidth="2"
                  strokeLinecap="round"
                />

                {/* Left floating badge */}
                <circle
                  cx="52"
                  cy="68"
                  r="20"
                  fill="#C8E2C5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle cx="52" cy="64" r="6" fill="#FFFFFF" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M40 80 C44 73, 60 73, 64 80"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />

                {/* Right floating badge */}
                <circle
                  cx="272"
                  cy="158"
                  r="20"
                  fill="var(--surface)"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle cx="272" cy="154" r="6" fill="#C8E2C5" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M260 170 C264 163, 280 163, 284 170"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />

                {/* Meditating figure */}
                <path
                  d="M142 74 C142 60, 178 60, 178 74 L182 96 C174 102, 146 102, 138 96 Z"
                  fill="currentColor"
                />
                <circle
                  cx="160"
                  cy="80"
                  r="13"
                  fill="var(--surface)"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                {/* Closed eyes & serene smile */}
                <path d="M153 79 Q156 81 158 79" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M162 79 Q164 81 167 79" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M157 85 Q160 87 163 85" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />

                {/* Sage sweater */}
                <path
                  d="M132 104 C142 98, 178 98, 188 104 L216 138 L236 126 L242 135 L212 156 L190 128 L188 164 L132 164 L130 128 L108 156 L78 135 L84 126 L104 138 Z"
                  fill="#8EC38B"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />

                {/* Heart outline on chest */}
                <path
                  d="M160 144 C150 136, 145 129, 149 124 C153 120, 158 122, 160 126 C162 122, 167 120, 171 124 C175 129, 170 136, 160 144 Z"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />

                {/* Crossed legs */}
                <path
                  d="M132 164 C104 166, 94 186, 114 196 C134 206, 168 196, 186 196 C206 196, 216 186, 204 172 C194 162, 176 164, 132 164 Z"
                  fill="var(--surface)"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M126 176 C144 180, 176 180, 194 176"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>

              {/* Floating progress preview widget */}
              <div className="floating-preview-card">
                <div className="preview-card-top">
                  <div className="preview-title">{currentSlide.title}</div>
                  <div className="preview-meta">{currentSlide.meta}</div>
                </div>
                <div className="preview-card-bottom">
                  <span className="preview-pill">{currentSlide.tag}</span>
                  <div className="preview-donut">
                    <svg width="44" height="44" viewBox="0 0 44 44">
                      <circle
                        cx="22"
                        cy="22"
                        r={circleRadius}
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth="4"
                      />
                      <circle
                        cx="22"
                        cy="22"
                        r={circleRadius}
                        fill="none"
                        stroke="#8EC38B"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        transform="rotate(-90 22 22)"
                      />
                    </svg>
                    <span className="preview-donut-text">{currentSlide.percent}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="showcase-dots">
              {SLIDES.map((s, idx) => (
                <button
                  key={s.title}
                  type="button"
                  className={`showcase-dot ${idx === slideIndex ? 'active' : ''}`}
                  onClick={() => setSlideIndex(idx)}
                  tabIndex={-1}
                />
              ))}
            </div>

            <p className="showcase-tagline">
              {currentSlide.captionPrefix}
              <strong>{currentSlide.captionBold}</strong>
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

            <ul className="password-rules" aria-label="Requisitos de senha">
              <li className={regStrength.minLength ? 'ok' : ''}>
                Mínimo de 8 caracteres
              </li>
              <li className={regStrength.hasLetter ? 'ok' : ''}>
                Pelo menos 1 letra
              </li>
              <li className={regStrength.hasNumber ? 'ok' : ''}>
                Pelo menos 1 número
              </li>
            </ul>

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

          <ul className="password-rules" aria-label="Requisitos de senha">
            <li className={resetStrength.minLength ? 'ok' : ''}>
              Mínimo de 8 caracteres
            </li>
            <li className={resetStrength.hasLetter ? 'ok' : ''}>
              Pelo menos 1 letra
            </li>
            <li className={resetStrength.hasNumber ? 'ok' : ''}>
              Pelo menos 1 número
            </li>
          </ul>

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
