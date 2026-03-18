import {
  Component, ElementRef, ViewChild, AfterViewInit,
  OnDestroy, inject, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { TelemetryService } from '../shared/services/telemetry.service';
import { TelemetryReading } from '../shared/models/telemetry.model';
import { SimulationRenderer } from './simulation.renderer';

@Component({
  selector: 'app-simulation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './simulation.component.html',
  styleUrl: './simulation.component.scss',
})
export class SimulationComponent implements AfterViewInit, OnDestroy {
  @ViewChild('simCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly telemetry = inject(TelemetryService);
  private readonly zone = inject(NgZone);
  private readonly destroy$ = new Subject<void>();
  private renderer!: SimulationRenderer;

  simulationTime = '';
  connected = false;
  selectedPoleId: string | null = null;
  speed = 1;
  running = true;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new SimulationRenderer(canvas);
    this.renderer.onPoleSelected = (poleId) => {
      this.zone.run(() => { this.selectedPoleId = poleId; });
    };

    this.telemetry.readings$
      .pipe(takeUntil(this.destroy$))
      .subscribe(readings => this.renderer.updateReadings(readings));

    this.telemetry.simulationTime$
      .pipe(takeUntil(this.destroy$))
      .subscribe(time => {
        this.simulationTime = time;
        this.renderer.updateTime(time);
      });

    this.telemetry.connected$
      .pipe(takeUntil(this.destroy$))
      .subscribe(c => this.connected = c);

    // Run animation loop outside Angular zone for performance
    this.zone.runOutsideAngular(() => this.renderer.startLoop());
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.telemetry.setSpeed(speed);
  }

  toggleRunning(): void {
    this.running = !this.running;
    if (this.running) {
      this.telemetry.resume();
    } else {
      this.telemetry.pause();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.renderer.destroy();
  }
}
