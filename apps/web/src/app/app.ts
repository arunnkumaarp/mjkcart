import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Store } from './core/store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  constructor() {
    inject(Store).load();
  }
}
