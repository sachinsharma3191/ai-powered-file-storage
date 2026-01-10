import { Injectable } from '@angular/core';
import { McpService } from './mcp.service';
import { StorageService } from './storage.service';
import { S3Service } from './s3.service';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';

export interface ChatCommand {
  id: string;
  command: string;
  intent: string;
  parameters: Record<string, any>;
  protocol: 'rest' | 's3' | 'mcp' | 'auto';
  confidence: number;
  timestamp: Date;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  executedBy: string;
  executionTime: number;
}

export interface ChatResponse {
  text: string;
  command?: ChatCommand;
  result?: CommandResult;
  suggestions?: string[];
  isUser: boolean;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ChatCommandService {
  private isProcessing = new BehaviorSubject<boolean>(false);
  private commandHistory = new BehaviorSubject<ChatResponse[]>([]);
  
  isProcessing$ = this.isProcessing.asObservable();
  commandHistory$ = this.commandHistory.asObservable();

  // Command patterns and intents
  private commandPatterns = {
    // Bucket operations
    createBucket: {
      patterns: [
        /create\s+(?:a\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /make\s+(?:a\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /new\s+bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i
      ],
      protocol: 'auto' as const,
      parameters: ['name', 'region']
    },
    
    listBuckets: {
      patterns: [
        /list\s+buckets?/i,
        /show\s+buckets?/i,
        /get\s+buckets?/i,
        /what\s+buckets?\s+(?:do\s+)?(?:i\s+)?have?/i
      ],
      protocol: 'auto' as const,
      parameters: []
    },
    
    deleteBucket: {
      patterns: [
        /delete\s+(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /remove\s+(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i
      ],
      protocol: 'auto' as const,
      parameters: ['name']
    },

    // Object operations
    uploadFile: {
      patterns: [
        /upload\s+(?:the\s+)?file\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?\s+(?:to\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /put\s+(?:the\s+)?file\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?\s+(?:in\s+|to\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i
      ],
      protocol: 'auto' as const,
      parameters: ['filename', 'bucket', 'path']
    },
    
    listObjects: {
      patterns: [
        /list\s+(?:the\s+)?objects?\s+(?:in\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /show\s+(?:the\s+)?files?\s+(?:in\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /what\s+(?:files?|objects?)\s+(?:are\s+)?(?:in\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i
      ],
      protocol: 'auto' as const,
      parameters: ['bucket', 'prefix']
    },
    
    downloadFile: {
      patterns: [
        /download\s+(?:the\s+)?file\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?\s+(?:from\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /get\s+(?:the\s+)?file\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?\s+(?:from\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i
      ],
      protocol: 'auto' as const,
      parameters: ['filename', 'bucket']
    },
    
    deleteFile: {
      patterns: [
        /delete\s+(?:the\s+)?file\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?\s+(?:from\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /remove\s+(?:the\s+)?file\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?\s+(?:from\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i
      ],
      protocol: 'auto' as const,
      parameters: ['filename', 'bucket']
    },

    // Search operations
    searchFiles: {
      patterns: [
        /search\s+(?:for\s+)?(?:files?|objects?)\s+(?:matching\s+|with\s+)?["']?([^"'\s]+)["']?\s+(?:in\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /find\s+(?:files?|objects?)\s+(?:matching\s+|with\s+)?["']?([^"'\s]+)["']?\s+(?:in\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i
      ],
      protocol: 'mcp' as const,
      parameters: ['pattern', 'bucket']
    },

    // Info operations
    getFileInfo: {
      patterns: [
        /get\s+(?:the\s+)?info(?:rmation)?\s+(?:about\s+|for\s+)?(?:the\s+)?file\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?\s+(?:in\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /tell\s+me\s+(?:about\s+)?(?:the\s+)?file\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?\s+(?:in\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i
      ],
      protocol: 'mcp' as const,
      parameters: ['filename', 'bucket']
    },

    // URL operations
    getDownloadUrl: {
      patterns: [
        /get\s+(?:the\s+)?download\s+url\s+(?:for\s+)?(?:the\s+)?file\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?\s+(?:in\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i,
        /generate\s+(?:a\s+)?download\s+link\s+(?:for\s+)?(?:the\s+)?file\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?\s+(?:in\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i
      ],
      protocol: 'mcp' as const,
      parameters: ['filename', 'bucket']
    }
  };

  constructor(
    private mcpService: McpService,
    private storageService: StorageService,
    private s3Service: S3Service
  ) {}

  processCommand(userInput: string): Observable<ChatResponse> {
    this.isProcessing.next(true);

    // Parse the command
    const command = this.parseCommand(userInput);
    
    if (!command) {
      const response: ChatResponse = {
        text: this.generateHelpResponse(userInput),
        suggestions: this.generateSuggestions(userInput),
        isUser: false,
        timestamp: new Date()
      };
      
      this.addToHistory(response);
      this.isProcessing.next(false);
      return of(response);
    }

    // Execute the command
    return this.executeCommand(command).pipe(
      map(result => {
        const response: ChatResponse = {
          text: this.generateResponseText(command, result),
          command,
          result,
          suggestions: this.generateFollowupSuggestions(command, result),
          isUser: false,
          timestamp: new Date()
        };
        
        this.addToHistory(response);
        this.isProcessing.next(false);
        return response;
      }),
      catchError(error => {
        const response: ChatResponse = {
          text: `❌ Sorry, I encountered an error: ${error.message}`,
          command,
          result: {
            success: false,
            message: error.message,
            executedBy: command.protocol,
            executionTime: 0
          },
          isUser: false,
          timestamp: new Date()
        };
        
        this.addToHistory(response);
        this.isProcessing.next(false);
        return of(response);
      })
    );
  }

  private parseCommand(input: string): ChatCommand | null {
    const trimmedInput = input.trim().toLowerCase();
    
    for (const [intent, config] of Object.entries(this.commandPatterns)) {
      for (const pattern of config.patterns) {
        const match = trimmedInput.match(pattern);
        if (match) {
          const parameters: Record<string, any> = {};
          
          // Extract parameters based on the intent
          if (intent === 'createBucket') {
            parameters.name = match[1];
            parameters.region = 'us-east-1'; // Default region
          } else if (intent === 'deleteBucket') {
            parameters.name = match[1];
          } else if (intent === 'listObjects') {
            parameters.bucket = match[1];
            parameters.prefix = '';
          } else if (intent === 'uploadFile') {
            parameters.filename = match[1];
            parameters.bucket = match[2];
            parameters.path = '';
          } else if (intent === 'downloadFile' || intent === 'deleteFile') {
            parameters.filename = match[1];
            parameters.bucket = match[2];
          } else if (intent === 'searchFiles') {
            parameters.pattern = match[1];
            parameters.bucket = match[2];
          } else if (intent === 'getFileInfo' || intent === 'getDownloadUrl') {
            parameters.filename = match[1];
            parameters.bucket = match[2];
          }

          return {
            id: this.generateCommandId(),
            command: input,
            intent,
            parameters,
            protocol: config.protocol,
            confidence: this.calculateConfidence(match, input),
            timestamp: new Date()
          };
        }
      }
    }
    
    return null;
  }

  private executeCommand(command: ChatCommand): Observable<CommandResult> {
    const startTime = Date.now();
    
    // Choose the best protocol for the command
    const protocol = this.chooseProtocol(command);
    
    switch (command.intent) {
      case 'createBucket':
        return this.executeCreateBucket(command.parameters, protocol).pipe(
          map(result => ({ ...result, executionTime: Date.now() - startTime, executedBy: protocol }))
        );
      
      case 'listBuckets':
        return this.executeListBuckets(protocol).pipe(
          map(result => ({ ...result, executionTime: Date.now() - startTime, executedBy: protocol }))
        );
      
      case 'deleteBucket':
        return this.executeDeleteBucket(command.parameters, protocol).pipe(
          map(result => ({ ...result, executionTime: Date.now() - startTime, executedBy: protocol }))
        );
      
      case 'listObjects':
        return this.executeListObjects(command.parameters, protocol).pipe(
          map(result => ({ ...result, executionTime: Date.now() - startTime, executedBy: protocol }))
        );
      
      case 'uploadFile':
        return this.executeUploadFile(command.parameters, protocol).pipe(
          map(result => ({ ...result, executionTime: Date.now() - startTime, executedBy: protocol }))
        );
      
      case 'downloadFile':
        return this.executeDownloadFile(command.parameters, protocol).pipe(
          map(result => ({ ...result, executionTime: Date.now() - startTime, executedBy: protocol }))
        );
      
      case 'deleteFile':
        return this.executeDeleteFile(command.parameters, protocol).pipe(
          map(result => ({ ...result, executionTime: Date.now() - startTime, executedBy: protocol }))
        );
      
      case 'searchFiles':
        return this.executeSearchFiles(command.parameters, protocol).pipe(
          map(result => ({ ...result, executionTime: Date.now() - startTime, executedBy: protocol }))
        );
      
      case 'getFileInfo':
        return this.executeGetFileInfo(command.parameters, protocol).pipe(
          map(result => ({ ...result, executionTime: Date.now() - startTime, executedBy: protocol }))
        );
      
      case 'getDownloadUrl':
        return this.executeGetDownloadUrl(command.parameters, protocol).pipe(
          map(result => ({ ...result, executionTime: Date.now() - startTime, executedBy: protocol }))
        );
      
      default:
        return of({
          success: false,
          message: 'Unknown command intent',
          executedBy: protocol,
          executionTime: Date.now() - startTime
        });
    }
  }

  private executeCreateBucket(params: any, protocol: string): Observable<CommandResult> {
    if (protocol === 'mcp') {
      return this.mcpService.createBucket(params.name, params.region).pipe(
        map(() => ({ success: true, message: `✅ Bucket "${params.name}" created successfully` })),
        catchError(error => of({ success: false, message: `❌ Failed to create bucket: ${error.message}` }))
      );
    } else {
      // Use REST API
      return this.storageService.createBucket(params.name, params.region).pipe(
        map(() => ({ success: true, message: `✅ Bucket "${params.name}" created successfully` })),
        catchError(error => of({ success: false, message: `❌ Failed to create bucket: ${error.message}` }))
      );
    }
  }

  private executeListBuckets(protocol: string): Observable<CommandResult> {
    if (protocol === 'mcp') {
      return this.mcpService.listBuckets().pipe(
        map(buckets => ({ 
          success: true, 
          message: `📦 Found ${buckets.length} buckets: ${buckets.join(', ')}`,
          data: buckets 
        })),
        catchError(error => of({ success: false, message: `❌ Failed to list buckets: ${error.message}` }))
      );
    } else {
      return this.storageService.listBuckets().pipe(
        map(buckets => ({ 
          success: true, 
          message: `📦 Found ${buckets.length} buckets: ${buckets.map(b => b.name).join(', ')}`,
          data: buckets 
        })),
        catchError(error => of({ success: false, message: `❌ Failed to list buckets: ${error.message}` }))
      );
    }
  }

  private executeDeleteBucket(params: any, protocol: string): Observable<CommandResult> {
    if (protocol === 'mcp') {
      return this.mcpService.deleteBucket(params.name).pipe(
        map(() => ({ success: true, message: `🗑️ Bucket "${params.name}" deleted successfully` })),
        catchError(error => of({ success: false, message: `❌ Failed to delete bucket: ${error.message}` }))
      );
    } else {
      return this.storageService.deleteBucket(params.name).pipe(
        map(() => ({ success: true, message: `🗑️ Bucket "${params.name}" deleted successfully` })),
        catchError(error => of({ success: false, message: `❌ Failed to delete bucket: ${error.message}` }))
      );
    }
  }

  private executeListObjects(params: any, protocol: string): Observable<CommandResult> {
    if (protocol === 'mcp') {
      return this.mcpService.listObjects(params.bucket, params.prefix).pipe(
        map(objects => ({ 
          success: true, 
          message: `📄 Found ${objects.length} objects in bucket "${params.bucket}"`,
          data: objects 
        })),
        catchError(error => of({ success: false, message: `❌ Failed to list objects: ${error.message}` }))
      );
    } else {
      return this.storageService.listObjects(params.bucket).pipe(
        map(objects => ({ 
          success: true, 
          message: `📄 Found ${objects.length} objects in bucket "${params.bucket}"`,
          data: objects 
        })),
        catchError(error => of({ success: false, message: `❌ Failed to list objects: ${error.message}` }))
      );
    }
  }

  private executeUploadFile(params: any, protocol: string): Observable<CommandResult> {
    // For file uploads, we need to prompt for the actual file
    return of({
      success: false,
      message: `📎 To upload "${params.filename}" to bucket "${params.bucket}", please use the file upload interface above. Chat uploads are not yet supported.`,
      data: { requiresFileUpload: true, filename: params.filename, bucket: params.bucket }
    });
  }

  private executeDownloadFile(params: any, protocol: string): Observable<CommandResult> {
    if (protocol === 'mcp') {
      return this.mcpService.getDownloadUrl(params.bucket, params.filename).pipe(
        map(url => ({ 
          success: true, 
          message: `⬇️ Download URL for "${params.filename}": ${url}`,
          data: { url }
        })),
        catchError(error => of({ success: false, message: `❌ Failed to get download URL: ${error.message}` }))
      );
    } else {
      return of({
        success: false,
        message: `⬇️ Please use the S3 browser or file interface to download "${params.filename}" from bucket "${params.bucket}"`
      });
    }
  }

  private executeDeleteFile(params: any, protocol: string): Observable<CommandResult> {
    if (protocol === 'mcp') {
      return this.mcpService.deleteObject(params.bucket, params.filename).pipe(
        map(() => ({ success: true, message: `🗑️ File "${params.filename}" deleted successfully` })),
        catchError(error => of({ success: false, message: `❌ Failed to delete file: ${error.message}` }))
      );
    } else {
      return this.storageService.deleteObject(params.bucket, params.filename).pipe(
        map(() => ({ success: true, message: `🗑️ File "${params.filename}" deleted successfully` })),
        catchError(error => of({ success: false, message: `❌ Failed to delete file: ${error.message}` }))
      );
    }
  }

  private executeSearchFiles(params: any, protocol: string): Observable<CommandResult> {
    return this.mcpService.searchObjects(params.bucket, params.pattern).pipe(
      map(objects => ({ 
        success: true, 
        message: `🔍 Found ${objects.length} files matching "${params.pattern}" in bucket "${params.bucket}"`,
        data: objects 
      })),
      catchError(error => of({ success: false, message: `❌ Failed to search files: ${error.message}` }))
    );
  }

  private executeGetFileInfo(params: any, protocol: string): Observable<CommandResult> {
    return this.mcpService.getObjectInfo(params.bucket, params.filename).pipe(
      map(info => ({ 
        success: true, 
        message: `ℹ️ File information for "${params.filename}":`,
        data: info 
      })),
      catchError(error => of({ success: false, message: `❌ Failed to get file info: ${error.message}` }))
    );
  }

  private executeGetDownloadUrl(params: any, protocol: string): Observable<CommandResult> {
    return this.mcpService.getDownloadUrl(params.bucket, params.filename).pipe(
      map(url => ({ 
        success: true, 
        message: `🔗 Download URL for "${params.filename}": ${url}`,
        data: { url }
      })),
      catchError(error => of({ success: false, message: `❌ Failed to get download URL: ${error.message}` }))
    );
  }

  private chooseProtocol(command: ChatCommand): string {
    if (command.protocol !== 'auto') {
      return command.protocol;
    }
    
    // Choose best protocol based on intent
    const mcpIntents = ['searchFiles', 'getFileInfo', 'getDownloadUrl'];
    const s3Intents = ['uploadFile', 'downloadFile'];
    
    if (mcpIntents.includes(command.intent)) {
      return 'mcp';
    } else if (s3Intents.includes(command.intent)) {
      return 's3';
    } else {
      return 'rest';
    }
  }

  private generateResponseText(command: ChatCommand, result: CommandResult): string {
    return result.message;
  }

  private generateHelpResponse(input: string): string {
    const suggestions = [
      "Try commands like:",
      "• 'Create a bucket called my-data'",
      "• 'List all buckets'", 
      "• 'Show files in bucket my-data'",
      "• 'Search for *.pdf files in bucket documents'",
      "• 'Get download URL for file report.pdf in bucket documents'",
      "• 'Delete file old-data.csv from bucket my-data'"
    ];
    
    return `🤔 I didn't understand that. ${suggestions.join('\n')}`;
  }

  private generateSuggestions(input: string): string[] {
    const suggestions = [
      "Create a bucket called my-data",
      "List all buckets",
      "Show files in bucket my-data", 
      "Search for *.pdf files",
      "Get download URL for file"
    ];
    
    return suggestions.slice(0, 3);
  }

  private generateFollowupSuggestions(command: ChatCommand, result: CommandResult): string[] {
    if (!result.success) {
      return ["Try again", "List available commands", "Help"];
    }
    
    switch (command.intent) {
      case 'createBucket':
        return ["Upload files to this bucket", "List all buckets", "Create another bucket"];
      case 'listBuckets':
        return ["Create a new bucket", "Show files in a bucket", "Search for files"];
      case 'listObjects':
        return ["Upload a file", "Download a file", "Search for files"];
      case 'searchFiles':
        return ["Download a file", "Get file info", "Delete a file"];
      default:
        return ["List buckets", "Create a bucket", "Search for files"];
    }
  }

  private calculateConfidence(match: RegExpMatchArray, input: string): number {
    const matchLength = match[0].length;
    const inputLength = input.length;
    return Math.min(0.9, matchLength / inputLength + 0.3);
  }

  private generateCommandId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private addToHistory(response: ChatResponse): void {
    const current = this.commandHistory.value;
    this.commandHistory.next([...current, response]);
  }

  // Public methods for external access
  clearHistory(): void {
    this.commandHistory.next([]);
  }

  getCommandHistory(): ChatResponse[] {
    return this.commandHistory.value;
  }

  isCommandProcessing(): boolean {
    return this.isProcessing.value;
  }
}
