import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { ElementRef } from '@angular/core';

import { ChatInterfaceComponent } from './chat-interface.component';
import { ChatCommandService, ChatResponse, CommandResult } from '../../services/chat-command.service';
import { EnhancedChatService } from '../../services/enhanced-chat.service';

describe('ChatInterfaceComponent', () => {
  let component: ChatInterfaceComponent;
  let fixture: ComponentFixture<ChatInterfaceComponent>;
  let mockChatCommandService: jasmine.SpyObj<ChatCommandService>;
  let mockEnhancedChatService: jasmine.SpyObj<EnhancedChatService>;
  let mockMessagesContainer: ElementRef;

  const mockChatResponse: ChatResponse = {
    text: 'Test response',
    isUser: false,
    timestamp: new Date('2024-01-01T00:00:00Z'),
    command: {
      intent: 'list_buckets',
      protocol: 's3',
      confidence: 0.95,
      parameters: {}
    },
    result: {
      success: true,
      data: { buckets: ['test-bucket'] },
      executedBy: 's3',
      executionTime: 150
    },
    suggestions: ['Create a new bucket', 'List all objects']
  };

  const mockCommandResult: CommandResult = {
    success: true,
    data: { buckets: ['test-bucket'] },
    executedBy: 's3',
    executionTime: 150
  };

  beforeEach(async () => {
    const chatCommandServiceSpy = jasmine.createSpyObj('ChatCommandService', [
      'processMessage',
      'executeCommand'
    ]);

    const enhancedChatServiceSpy = jasmine.createSpyObj('EnhancedChatService', [
      'sendMessage',
      'getSuggestions'
    ]);

    chatCommandServiceSpy.processMessage.and.returnValue(of(mockChatResponse));
    chatCommandServiceSpy.executeCommand.and.returnValue(of(mockCommandResult));
    enhancedChatServiceSpy.sendMessage.and.returnValue(of(mockChatResponse));
    enhancedChatServiceSpy.getSuggestions.and.returnValue(of(['suggestion1', 'suggestion2']));

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FormsModule,
        ChatInterfaceComponent
      ],
      providers: [
        { provide: ChatCommandService, useValue: chatCommandServiceSpy },
        { provide: EnhancedChatService, useValue: enhancedChatServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatInterfaceComponent);
    component = fixture.componentInstance;
    mockChatCommandService = TestBed.inject(ChatCommandService) as jasmine.SpyObj<ChatCommandService>;
    mockEnhancedChatService = TestBed.inject(EnhancedChatService) as jasmine.SpyObj<EnhancedChatService>;
    
    mockMessagesContainer = {
      nativeElement: {
        scrollTop: 0,
        scrollHeight: 1000
      }
    } as ElementRef;
    
    component.messagesContainer = mockMessagesContainer;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize with empty messages and placeholder text', () => {
      expect(component.messages).toEqual([]);
      expect(component.messageText).toBe('');
      expect(component.isMinimized).toBeFalse();
      expect(component.showHelp).toBeFalse();
    });

    it('should set up default welcome message on ngOnInit', () => {
      component.ngOnInit();
      
      expect(component.messages.length).toBe(1);
      expect(component.messages[0].isUser).toBeFalse();
      expect(component.messages[0].text).toContain('Welcome to AI Storage Assistant');
    });
  });

  describe('Message Sending', () => {
    beforeEach(() => {
      component.ngOnInit();
      fixture.detectChanges();
    });

    it('should send message and add response', waitForAsync(() => {
      component.messageText = 'List all buckets';
      component.sendMessage();
      
      fixture.whenStable().then(() => {
        expect(component.messages.length).toBe(2); // Welcome + user message
        expect(component.messages[1].isUser).toBeTrue();
        expect(component.messages[1].text).toBe('List all buckets');
        expect(mockChatCommandService.processMessage).toHaveBeenCalledWith('List all buckets');
        expect(component.messageText).toBe('');
      });
    }));

    it('should not send empty message', () => {
      const initialLength = component.messages.length;
      
      component.messageText = '';
      component.sendMessage();
      
      expect(component.messages.length).toBe(initialLength);
      expect(mockChatCommandService.processMessage).not.toHaveBeenCalled();
    });

    it('should handle message processing error', waitForAsync(() => {
      mockChatCommandService.processMessage.and.returnValue(throwError(() => new Error('Processing failed')));
      spyOn(console, 'error');
      
      component.messageText = 'Test message';
      component.sendMessage();
      
      fixture.whenStable().then(() => {
        expect(console.error).toHaveBeenCalledWith('Error processing message:', jasmine.any(Error));
        expect(component.messages.length).toBe(2); // Should still add user message
      });
    }));

    it('should add error response when processing fails', waitForAsync(() => {
      mockChatCommandService.processMessage.and.returnValue(throwError(() => new Error('Processing failed')));
      
      component.messageText = 'Test message';
      component.sendMessage();
      
      fixture.whenStable().then(() => {
        expect(component.messages.length).toBe(3); // Welcome + user + error
        expect(component.messages[2].text).toContain('Sorry, I encountered an error');
        expect(component.messages[2].result?.success).toBeFalse();
      });
    }));
  });

  describe('Command Execution', () => {
    beforeEach(() => {
      component.messages = [mockChatResponse];
      fixture.detectChanges();
    });

    it('should execute command from suggestion', waitForAsync(() => {
      component.executeCommand('create_bucket', { name: 'test-bucket' });
      
      fixture.whenStable().then(() => {
        expect(mockChatCommandService.executeCommand).toHaveBeenCalledWith('create_bucket', { name: 'test-bucket' });
        expect(component.messages.length).toBe(2);
        expect(component.messages[1].result).toEqual(mockCommandResult);
      });
    }));

    it('should handle command execution error', waitForAsync(() => {
      mockChatCommandService.executeCommand.and.returnValue(throwError(() => new Error('Command failed')));
      spyOn(console, 'error');
      
      component.executeCommand('invalid_command', {});
      
      fixture.whenStable().then(() => {
        expect(console.error).toHaveBeenCalledWith('Error executing command:', jasmine.any(Error));
      });
    }));
  });

  describe('UI Interactions', () => {
    beforeEach(() => {
      component.ngOnInit();
      fixture.detectChanges();
    });

    it('should toggle minimize state', () => {
      expect(component.isMinimized).toBeFalse();
      
      component.toggleMinimize();
      expect(component.isMinimized).toBeTrue();
      
      component.toggleMinimize();
      expect(component.isMinimized).toBeFalse();
    });

    it('should toggle help panel', () => {
      expect(component.showHelp).toBeFalse();
      
      component.toggleHelp();
      expect(component.showHelp).toBeTrue();
      
      component.toggleHelp();
      expect(component.showHelp).toBeFalse();
    });

    it('should clear messages', () => {
      component.messages = [mockChatResponse, mockChatResponse];
      
      component.clearMessages();
      
      expect(component.messages).toEqual([]);
    });

    it('should apply suggestion and send message', waitForAsync(() => {
      component.applySuggestion('Create a new bucket');
      
      fixture.whenStable().then(() => {
        expect(component.messageText).toBe('Create a new bucket');
        expect(mockChatCommandService.processMessage).toHaveBeenCalledWith('Create a new bucket');
      });
    }));

    it('should handle enter key press', () => {
      spyOn(component, 'sendMessage');
      
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      component.handleKeyPress(event);
      
      expect(component.sendMessage).toHaveBeenCalled();
    });

    it('should not send message on shift+enter', () => {
      spyOn(component, 'sendMessage');
      
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
      component.handleKeyPress(event);
      
      expect(component.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle suggestion click', waitForAsync(() => {
      component.messages = [mockChatResponse];
      fixture.detectChanges();
      
      component.onSuggestionClick('List all buckets');
      
      fixture.whenStable().then(() => {
        expect(mockChatCommandService.processMessage).toHaveBeenCalledWith('List all buckets');
      });
    }));
  });

  describe('Helper Methods', () => {
    it('should format time correctly', () => {
      const date = new Date('2024-01-01T12:30:00Z');
      const result = component.formatTime(date);
      
      expect(result).toMatch(/^\d{2}:\d{2}$/); // Should match HH:MM format
    });

    it('should round numbers correctly', () => {
      expect(component.round(3.7)).toBe(4);
      expect(component.round(3.2)).toBe(3);
      expect(component.round(0)).toBe(0);
    });

    it('should get object keys', () => {
      const obj = { key1: 'value1', key2: 'value2' };
      const keys = component.keys(obj);
      
      expect(keys).toEqual(['key1', 'key2']);
    });

    it('should track messages by timestamp and user flag', () => {
      const message1: ChatResponse = {
        text: 'Test 1',
        isUser: true,
        timestamp: new Date('2024-01-01T00:00:00Z')
      };
      const message2: ChatResponse = {
        text: 'Test 2',
        isUser: false,
        timestamp: new Date('2024-01-01T00:00:01Z')
      };
      
      const track1 = component.trackByMessage(0, message1);
      const track2 = component.trackByMessage(1, message2);
      
      expect(track1).toBe(`${message1.timestamp.getTime()}-true`);
      expect(track2).toBe(`${message2.timestamp.getTime()}-false`);
    });
  });

  describe('Auto-scroll', () => {
    it('should scroll to bottom after adding message', () => {
      spyOn(component, 'scrollToBottom');
      
      component.messages = [mockChatResponse];
      fixture.detectChanges();
      
      expect(component.scrollToBottom).toHaveBeenCalled();
    });

    it('should scroll to bottom manually', () => {
      component.scrollToBottom();
      
      expect(mockMessagesContainer.nativeElement.scrollTop).toBe(1000);
    });
  });

  describe('Template Rendering', () => {
    beforeEach(() => {
      component.ngOnInit();
      component.messages = [mockChatResponse];
      fixture.detectChanges();
    });

    it('should render message list', () => {
      const messageElements = fixture.debugElement.queryAll(By.css('.message'));
      expect(messageElements.length).toBe(2); // Welcome + mock response
    });

    it('should render input field', () => {
      const input = fixture.debugElement.query(By.css('textarea'));
      expect(input).toBeTruthy();
      expect(input.nativeElement.placeholder).toContain('Type your message');
    });

    it('should render send button', () => {
      const sendButton = fixture.debugElement.query(By.css('.send-button'));
      expect(sendButton).toBeTruthy();
    });

    it('should render minimize button', () => {
      const minimizeButton = fixture.debugElement.query(By.css('.minimize-button'));
      expect(minimizeButton).toBeTruthy();
    });

    it('should render help button', () => {
      const helpButton = fixture.debugElement.query(By.css('.help-button'));
      expect(helpButton).toBeTruthy();
    });

    it('should show command details when present', () => {
      const commandDetails = fixture.debugElement.query(By.css('.command-details'));
      expect(commandDetails).toBeTruthy();
      expect(commandDetails.nativeElement.textContent).toContain('list_buckets');
    });

    it('should show execution result when present', () => {
      const executionResult = fixture.debugElement.query(By.css('.execution-result'));
      expect(executionResult).toBeTruthy();
      expect(executionResult.nativeElement.textContent).toContain('Executed');
    });

    it('should show suggestions when present', () => {
      const suggestions = fixture.debugElement.query(By.css('.suggestions'));
      expect(suggestions).toBeTruthy();
      expect(suggestions.nativeElement.textContent).toContain('Suggestions');
    });

    it('should render help panel when toggled', () => {
      component.showHelp = true;
      fixture.detectChanges();
      
      const helpPanel = fixture.debugElement.query(By.css('.help-panel'));
      expect(helpPanel).toBeTruthy();
    });

    it('should apply minimized class when minimized', () => {
      component.isMinimized = true;
      fixture.detectChanges();
      
      const chatBody = fixture.debugElement.query(By.css('.chat-body'));
      expect(chatBody.nativeElement.classList.contains('minimized')).toBeTrue();
    });

    it('should show loading state when processing', waitForAsync(() => {
      mockChatCommandService.processMessage.and.returnValue(new Promise(() => {}));
      
      component.messageText = 'Test';
      component.sendMessage();
      fixture.detectChanges();
      
      const loadingIndicator = fixture.debugElement.query(By.css('.loading-indicator'));
      expect(loadingIndicator).toBeTruthy();
    }));
  });

  describe('Message History', () => {
    it('should maintain message order', () => {
      component.ngOnInit();
      
      const message1 = { ...mockChatResponse, text: 'First', timestamp: new Date('2024-01-01T00:00:00Z') };
      const message2 = { ...mockChatResponse, text: 'Second', timestamp: new Date('2024-01-01T00:01:00Z') };
      
      component.messages.push(message1);
      component.messages.push(message2);
      
      expect(component.messages[0].text).toContain('Welcome');
      expect(component.messages[1].text).toBe('First');
      expect(component.messages[2].text).toBe('Second');
    });

    it('should differentiate user and bot messages', () => {
      const userMessage = { ...mockChatResponse, isUser: true, text: 'User message' };
      const botMessage = { ...mockChatResponse, isUser: false, text: 'Bot message' };
      
      component.messages = [userMessage, botMessage];
      fixture.detectChanges();
      
      const messageElements = fixture.debugElement.queryAll(By.css('.message'));
      expect(messageElements[0].nativeElement.classList.contains('user')).toBeTrue();
      expect(messageElements[1].nativeElement.classList.contains('user')).toBeFalse();
    });
  });

  describe('Component Lifecycle', () => {
    it('should clean up subscriptions on ngOnDestroy', () => {
      component.ngOnInit();
      
      const subscription = component['subscriptions'][0];
      spyOn(subscription, 'unsubscribe');
      
      component.ngOnDestroy();
      
      expect(subscription.unsubscribe).toHaveBeenCalled();
    });
  });
});
