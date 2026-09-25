// Link nossacasa://conectar?d=... — quem trata é o layout raiz; aqui só voltamos para o início.
import { Redirect } from 'expo-router';

export default function Connect() {
  return <Redirect href="/" />;
}
