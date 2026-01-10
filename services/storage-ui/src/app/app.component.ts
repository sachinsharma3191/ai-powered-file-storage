import { Component, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { SessionService } from './services/session.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <div class="min-h-screen bg-gray-50">
      <app-navbar />
      <main class="container mx-auto px-4 py-8">
        <router-outlet />
      </main>
    </div>
  `
})
export class AppComponent implements OnDestroy {
  private sessionService = inject(SessionService);

  constructor() {
    // Initialize session monitoring when app starts
  }

  ngOnDestroy(): void {
    // Cleanup session service when app is destroyed
    this.sessionService.destroy();
  }
}
