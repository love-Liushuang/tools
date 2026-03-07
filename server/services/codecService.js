const localCodec = require('./letterCodec');

const MAX_PASSWORD_LENGTH = 64;
const MAX_ENCRYPT_TEXT_LENGTH = 2000;
const MAX_DECRYPT_TEXT_LENGTH = 5000;

function validateRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('请求体必须是 JSON 对象');
  }

  const action = payload.action;
  const text = payload.text;
  const usePassword = Boolean(payload.usePassword);
  const password = usePassword ? String(payload.password || '') : '';

  if (action !== 'encrypt' && action !== 'decrypt') {
    throw new Error('action 必须是 encrypt 或 decrypt');
  }
  if (typeof text !== 'string') {
    throw new Error('text 必须是字符串');
  }
  if (action === 'encrypt' && text.length > MAX_ENCRYPT_TEXT_LENGTH) {
    throw new Error(`加密文本最多 ${MAX_ENCRYPT_TEXT_LENGTH} 字符`);
  }
  if (action === 'decrypt' && text.length > MAX_DECRYPT_TEXT_LENGTH) {
    throw new Error(`解密文本最多 ${MAX_DECRYPT_TEXT_LENGTH} 字符`);
  }
  if (usePassword && !password) {
    throw new Error('已勾选使用密码，请输入密码');
  }
  if (usePassword && password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`密码最多 ${MAX_PASSWORD_LENGTH} 个字符`);
  }
  if (usePassword && /\s/.test(password)) {
    throw new Error('密码不允许空白字符（空格/Tab/换行）');
  }

  return { action, text, password };
}

async function handleTextLetter(payload) {
  const parsed = validateRequest(payload);
  return {
    output: localCodec[parsed.action](parsed.text, parsed.password)
  };
}

module.exports = {
  handleTextLetter
};
