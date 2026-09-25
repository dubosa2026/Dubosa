// O Hermes (motor JS do Android) não tem crypto.randomUUID: usamos o do expo-crypto,
// que é criptograficamente seguro, para os ids de registros novos.
import * as Crypto from 'expo-crypto';

const g = globalThis as { crypto?: { randomUUID?: () => string } };
if (!g.crypto) g.crypto = {};
if (!g.crypto.randomUUID) g.crypto.randomUUID = () => Crypto.randomUUID();
