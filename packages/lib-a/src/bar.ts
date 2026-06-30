import 'varlock/auto-load';
import { ENV } from 'varlock/env';

export function foobar() {
  return ENV.MY_VAR;
}
