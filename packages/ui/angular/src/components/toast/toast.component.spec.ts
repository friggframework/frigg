/**
 * Unit tests for Toast Component
 */

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import { FriggToastComponent } from './toast.component';

describe('FriggToastComponent', () => {
  let component: FriggToastComponent;
  let fixture: ComponentFixture<FriggToastComponent>;
  let debugElement: DebugElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FriggToastComponent, BrowserAnimationsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(FriggToastComponent);
    component = fixture.componentInstance;
    debugElement = fixture.debugElement;
    
    // Set required inputs
    component.id = 'test-toast-1';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('rendering', () => {
    it('should render title when provided', () => {
      component.title = 'Test Title';
      fixture.detectChanges();
      
      const titleEl = debugElement.query(By.css('.frigg-toast__title'));
      expect(titleEl.nativeElement.textContent).toBe('Test Title');
    });

    it('should render description when provided', () => {
      component.description = 'Test Description';
      fixture.detectChanges();
      
      const descEl = debugElement.query(By.css('.frigg-toast__description'));
      expect(descEl.nativeElement.textContent).toBe('Test Description');
    });

    it('should not render title element when not provided', () => {
      fixture.detectChanges();
      
      const titleEl = debugElement.query(By.css('.frigg-toast__title'));
      expect(titleEl).toBeNull();
    });

    it('should apply correct variant class', () => {
      component.variant = 'success';
      fixture.detectChanges();
      
      const toastEl = debugElement.query(By.css('.frigg-toast'));
      expect(toastEl.nativeElement.classList.contains('frigg-toast--success')).toBeTruthy();
    });

    it('should render correct icon for each variant', () => {
      const variants: Array<'success' | 'error' | 'warning' | 'info'> = ['success', 'error', 'warning', 'info'];
      
      variants.forEach(variant => {
        component.variant = variant;
        fixture.detectChanges();
        
        const iconEl = debugElement.query(By.css('.frigg-toast__icon svg'));
        expect(iconEl).toBeTruthy();
      });
    });

    it('should render action button when provided', () => {
      component.action = {
        label: 'Undo',
        onClick: jasmine.createSpy('onClick')
      };
      fixture.detectChanges();
      
      const actionBtn = debugElement.query(By.css('.frigg-toast__action'));
      expect(actionBtn.nativeElement.textContent.trim()).toBe('Undo');
    });

    it('should always render close button', () => {
      fixture.detectChanges();
      
      const closeBtn = debugElement.query(By.css('.frigg-toast__close'));
      expect(closeBtn).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('should emit click event when toast is clicked', () => {
      spyOn(component.click, 'emit');
      fixture.detectChanges();
      
      const toastEl = debugElement.query(By.css('.frigg-toast'));
      toastEl.nativeElement.click();
      
      expect(component.click.emit).toHaveBeenCalled();
    });

    it('should call action onClick when action button is clicked', () => {
      const onClickSpy = jasmine.createSpy('onClick');
      component.action = {
        label: 'Undo',
        onClick: onClickSpy
      };
      fixture.detectChanges();
      
      const actionBtn = debugElement.query(By.css('.frigg-toast__action'));
      actionBtn.nativeElement.click();
      
      expect(onClickSpy).toHaveBeenCalled();
    });

    it('should emit dismiss event when close button is clicked', () => {
      spyOn(component.dismiss, 'emit');
      fixture.detectChanges();
      
      const closeBtn = debugElement.query(By.css('.frigg-toast__close'));
      closeBtn.nativeElement.click();
      
      expect(component.dismiss.emit).toHaveBeenCalled();
    });

    it('should stop propagation when action button is clicked', () => {
      component.action = {
        label: 'Undo',
        onClick: jasmine.createSpy('onClick')
      };
      spyOn(component.click, 'emit');
      fixture.detectChanges();
      
      const actionBtn = debugElement.query(By.css('.frigg-toast__action'));
      actionBtn.nativeElement.click();
      
      expect(component.click.emit).not.toHaveBeenCalled();
    });
  });

  describe('auto-dismiss', () => {
    it('should auto-dismiss after duration', fakeAsync(() => {
      spyOn(component.dismiss, 'emit');
      component.duration = 1000;
      
      fixture.detectChanges();
      component.ngOnInit();
      
      tick(1000);
      
      expect(component.dismiss.emit).toHaveBeenCalled();
    }));

    it('should not auto-dismiss when duration is 0', fakeAsync(() => {
      spyOn(component.dismiss, 'emit');
      component.duration = 0;
      
      fixture.detectChanges();
      component.ngOnInit();
      
      tick(5000);
      
      expect(component.dismiss.emit).not.toHaveBeenCalled();
    }));

    it('should cancel auto-dismiss on destroy', fakeAsync(() => {
      spyOn(component.dismiss, 'emit');
      component.duration = 1000;
      
      fixture.detectChanges();
      component.ngOnInit();
      
      tick(500);
      component.ngOnDestroy();
      tick(1000);
      
      expect(component.dismiss.emit).not.toHaveBeenCalled();
    }));
  });

  describe('animations', () => {
    it('should start with visible animation state', () => {
      fixture.detectChanges();
      
      expect(component.animationState).toBe('visible');
    });

    it('should change animation state to hidden before dismissing', fakeAsync(() => {
      spyOn(component.dismiss, 'emit');
      
      component.close();
      
      expect(component.animationState).toBe('hidden');
      
      tick(200);
      
      expect(component.dismiss.emit).toHaveBeenCalled();
    }));
  });

  describe('accessibility', () => {
    it('should have close button with aria-label', () => {
      fixture.detectChanges();
      
      const closeBtn = debugElement.query(By.css('.frigg-toast__close'));
      expect(closeBtn.nativeElement.getAttribute('aria-label')).toBe('Close');
    });

    it('should be keyboard accessible', () => {
      fixture.detectChanges();
      
      const closeBtn = debugElement.query(By.css('.frigg-toast__close'));
      expect(closeBtn.nativeElement.tagName).toBe('BUTTON');
    });
  });
});