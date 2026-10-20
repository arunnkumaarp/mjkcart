import { Injectable, inject } from '@angular/core';
import { createApi } from '@mjkcart/api';

import { API_URL } from '../config';
import { Auth } from './auth';

@Injectable({ providedIn: 'root' })
export class Api {
  private auth = inject(Auth);
  readonly client = createApi({ baseUrl: API_URL, getToken: () => this.auth.token() });
}
