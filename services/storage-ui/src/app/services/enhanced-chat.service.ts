import { Injectable } from '@angular/core';
import { ChatCommandService, ChatResponse, CommandResult } from './chat-command.service';
import { StorageService } from './storage.service';
import { S3Service } from './s3.service';
import { Observable, of, throwError } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';

export interface FileUploadRequest {
  file: File;
  bucket: string;
  key?: string;
  metadata?: Record<string, string>;
}

export interface ChatFileOperation {
  type: 'upload' | 'download' | 'delete';
  file?: File;
  bucket: string;
  key: string;
  metadata?: Record<string, string>;
}

@Injectable({
  providedIn: 'root'
})
export class EnhancedChatService {
  private pendingOperations: ChatFileOperation[] = [];

  constructor(
    private chatService: ChatCommandService,
    private storageService: StorageService,
    private s3Service: S3Service
  ) {}

  // Enhanced command processing with file operation support
  processCommandWithFiles(userInput: string, files?: File[]): Observable<ChatResponse> {
    // Check if this is a file upload command
    if (files && files.length > 0) {
      return this.processFileUploadCommand(userInput, files);
    }

    // Process regular command
    return this.chatService.processCommand(userInput);
  }

  private processFileUploadCommand(userInput: string, files: File[]): Observable<ChatResponse> {
    const trimmedInput = userInput.trim().toLowerCase();
    
    // Parse bucket name from command
    const bucketMatch = trimmedInput.match(/(?:to\s+)?(?:the\s+)?bucket\s+(?:called\s+|named\s+)?["']?([^"'\s]+)["']?/i);
    
    if (!bucketMatch) {
      return of({
        text: '❌ Please specify which bucket to upload to. Example: "Upload file to bucket called my-data"',
        isUser: false,
        timestamp: new Date()
      });
    }

    const bucketName = bucketMatch[1];
    
    // Create upload operations for each file
    const operations: ChatFileOperation[] = files.map(file => ({
      type: 'upload' as const,
      file,
      bucket: bucketName,
      key: file.name,
      metadata: {
        original_name: file.name,
        size: file.size.toString(),
        content_type: file.type,
        uploaded_via: 'chat_interface',
        upload_time: new Date().toISOString()
      }
    }));

    return this.executeFileUploads(operations);
  }

  private executeFileUploads(operations: ChatFileOperation[]): Observable<ChatResponse> {
    if (operations.length === 0) {
      return of({
        text: '❌ No files to upload',
        isUser: false,
        timestamp: new Date()
      });
    }

    const results: string[] = [];
    let completed = 0;
    let errors = 0;

    // Process uploads sequentially for better error handling
    return new Observable(observer => {
      const processNext = (index: number) => {
        if (index >= operations.length) {
          // All uploads completed
          const successMessage = completed > 0 ? `✅ Successfully uploaded ${completed} file${completed > 1 ? 's' : ''}` : '';
          const errorMessage = errors > 0 ? `❌ Failed to upload ${errors} file${errors > 1 ? 's' : ''}` : '';
          const separator = successMessage && errorMessage ? '\n' : '';
          
          observer.next({
            text: `${successMessage}${separator}${errorMessage}`,
            isUser: false,
            timestamp: new Date(),
            result: {
              success: errors === 0,
              message: `Uploaded ${completed}/${operations.length} files`,
              data: { uploaded: completed, failed: errors, total: operations.length },
              executedBy: 'rest',
              executionTime: 0
            }
          });
          observer.complete();
          return;
        }

        const operation = operations[index];
        if (operation.type === 'upload' && operation.file) {
          this.uploadSingleFile(operation).subscribe({
            next: result => {
              if (result.success) {
                completed++;
                results.push(`✅ ${operation.file?.name}`);
              } else {
                errors++;
                results.push(`❌ ${operation.file?.name}: ${result.message}`);
              }
              processNext(index + 1);
            },
            error: error => {
              errors++;
              results.push(`❌ ${operation.file?.name}: ${error.message}`);
              processNext(index + 1);
            }
          });
        }
      };

      processNext(0);
    });
  }

  private uploadSingleFile(operation: ChatFileOperation): Observable<CommandResult> {
    if (!operation.file) {
      return of({
        success: false,
        message: 'No file provided',
        executedBy: 'rest',
        executionTime: 0
      });
    }

    const startTime = Date.now();

    // First create object record
    return this.storageService.createObject(operation.bucket, operation.key).pipe(
      switchMap((createResponse: any) => {
        if (createResponse.token) {
          // Convert file to ArrayBuffer
          const reader = new FileReader();
          return new Observable<CommandResult>(observer => {
            reader.onload = () => {
              const arrayBuffer = reader.result as ArrayBuffer;
              
              // Upload to chunk gateway
              this.storageService.uploadToChunkGateway(
                createResponse.chunk_gateway_base_url,
                createResponse.token,
                arrayBuffer
              ).subscribe({
                next: () => {
                  observer.next({
                    success: true,
                    message: `File "${operation.key}" uploaded successfully`,
                    executedBy: 'rest',
                    executionTime: Date.now() - startTime
                  });
                  observer.complete();
                },
                error: (error) => {
                  observer.next({
                    success: false,
                    message: `Upload failed: ${error.message}`,
                    executedBy: 'rest',
                    executionTime: Date.now() - startTime
                  });
                  observer.complete();
                }
              });
            };
            
            reader.onerror = () => {
              observer.next({
                success: false,
                message: 'Failed to read file',
                executedBy: 'rest',
                executionTime: Date.now() - startTime
              });
              observer.complete();
            };
            
            reader.readAsArrayBuffer(operation.file!);
          });
        } else {
          return of({
            success: false,
            message: 'Failed to get upload token',
            executedBy: 'rest',
            executionTime: Date.now() - startTime
          });
        }
      }),
      catchError(error => of({
        success: false,
        message: `Upload failed: ${error.message}`,
        executedBy: 'rest',
        executionTime: Date.now() - startTime
      }))
    );
  }

  // Handle download requests from chat
  downloadFile(bucket: string, key: string): Observable<CommandResult> {
    const startTime = Date.now();

    // Since getDownloadUrl doesn't exist on StorageService, we'll provide a message
    // directing users to use the appropriate interface
    return of({
      success: false,
      message: `⬇️ Please use the S3 browser or file interface to download "${key}" from bucket "${bucket}". The download URL feature is not yet available in the chat interface.`,
      executedBy: 'rest',
      executionTime: Date.now() - startTime
    });
  }

  // Handle file deletion from chat
  deleteFile(bucket: string, key: string): Observable<CommandResult> {
    const startTime = Date.now();

    return this.storageService.deleteObject(bucket, key).pipe(
      map(() => ({
        success: true,
        message: `🗑️ File "${key}" deleted successfully`,
        executedBy: 'rest',
        executionTime: Date.now() - startTime
      })),
      catchError(error => of({
        success: false,
        message: `Delete failed: ${error.message}`,
        executedBy: 'rest',
        executionTime: Date.now() - startTime
      }))
    );
  }

  // Get file information
  getFileInfo(bucket: string, key: string): Observable<CommandResult> {
    const startTime = Date.now();

    return this.storageService.listObjects(bucket).pipe(
      map((response: any) => {
        const objects = response.objects || [];
        const file = objects.find((obj: any) => obj.key === key);
        if (file) {
          return {
            success: true,
            message: `📄 File information for "${key}"`,
            data: file,
            executedBy: 'rest',
            executionTime: Date.now() - startTime
          };
        } else {
          return {
            success: false,
            message: `File "${key}" not found`,
            executedBy: 'rest',
            executionTime: Date.now() - startTime
          };
        }
      }),
      catchError(error => of({
        success: false,
        message: `Failed to get file info: ${error.message}`,
        executedBy: 'rest',
        executionTime: Date.now() - startTime
      }))
    );
  }

  // Search files with pattern
  searchFiles(bucket: string, pattern: string): Observable<CommandResult> {
    const startTime = Date.now();

    return this.storageService.listObjects(bucket).pipe(
      map((response: any) => {
        const objects = response.objects || [];
        // Simple pattern matching (can be enhanced)
        const regex = new RegExp(pattern.replace('*', '.*'), 'i');
        const matches = objects.filter((obj: any) => regex.test(obj.key));
        
        return {
          success: true,
          message: `🔍 Found ${matches.length} files matching "${pattern}"`,
          data: matches,
          executedBy: 'rest',
          executionTime: Date.now() - startTime
        };
      }),
      catchError(error => of({
        success: false,
        message: `Search failed: ${error.message}`,
        executedBy: 'rest',
        executionTime: Date.now() - startTime
      }))
    );
  }

  // Get file statistics
  getStorageStats(bucket?: string): Observable<CommandResult> {
    const startTime = Date.now();

    if (bucket) {
      return this.storageService.listObjects(bucket).pipe(
        map((response: any) => {
          const objects = response.objects || [];
          const totalSize = objects.reduce((sum: number, obj: any) => sum + (obj.size || 0), 0);
          const fileTypes = objects.reduce((types: Record<string, number>, obj: any) => {
            const ext = obj.key.split('.').pop()?.toLowerCase() || 'unknown';
            types[ext] = (types[ext] || 0) + 1;
            return types;
          }, {} as Record<string, number>);
          
          return {
            success: true,
            message: `📊 Storage statistics for bucket "${bucket}"`,
            data: {
              totalFiles: objects.length,
              totalSize,
              averageSize: objects.length > 0 ? totalSize / objects.length : 0,
              fileTypes
            },
            executedBy: 'rest',
            executionTime: Date.now() - startTime
          };
        }),
        catchError(error => of({
          success: false,
          message: `Failed to get stats: ${error.message}`,
          executedBy: 'rest',
          executionTime: Date.now() - startTime
        }))
      );
    } else {
      // Get stats for all buckets
      return this.storageService.listBuckets().pipe(
        switchMap((buckets: any[]) => {
          const statsPromises = buckets.map(bucket => 
            this.storageService.listObjects(bucket.name).pipe(
              map((response: any) => ({
                bucket: bucket.name,
                fileCount: (response.objects || []).length,
                totalSize: (response.objects || []).reduce((sum: number, obj: any) => sum + (obj.size || 0), 0)
              }))
            )
          );
          
          // Combine all bucket stats
          let completed = 0;
          const allStats: any[] = [];
          
          return new Observable<CommandResult>(observer => {
            statsPromises.forEach((stat$, index) => {
              stat$.subscribe({
                next: stat => {
                  allStats.push(stat);
                  completed++;
                  if (completed === buckets.length) {
                    const totalFiles = allStats.reduce((sum, stat) => sum + stat.fileCount, 0);
                    const totalSize = allStats.reduce((sum, stat) => sum + stat.totalSize, 0);
                    
                    observer.next({
                      success: true,
                      message: `📊 Overall storage statistics`,
                      data: {
                        totalBuckets: buckets.length,
                        totalFiles,
                        totalSize,
                        buckets: allStats
                      },
                      executedBy: 'rest',
                      executionTime: Date.now() - startTime
                    });
                    observer.complete();
                  }
                },
                error: error => {
                  observer.error(error);
                }
              });
            });
          });
        }),
        catchError(error => of({
          success: false,
          message: `Failed to get stats: ${error.message}`,
          executedBy: 'rest',
          executionTime: Date.now() - startTime
        }))
      );
    }
  }

  // Batch operations
  batchDelete(bucket: string, keys: string[]): Observable<CommandResult> {
    const startTime = Date.now();
    let completed = 0;
    let errors = 0;

    return new Observable(observer => {
      const deleteNext = (index: number) => {
        if (index >= keys.length) {
          observer.next({
            success: errors === 0,
            message: `🗑️ Deleted ${completed}/${keys.length} files`,
            data: { deleted: completed, failed: errors, total: keys.length },
            executedBy: 'rest',
            executionTime: Date.now() - startTime
          });
          observer.complete();
          return;
        }

        this.deleteFile(bucket, keys[index]).subscribe({
          next: result => {
            if (result.success) {
              completed++;
            } else {
              errors++;
            }
            deleteNext(index + 1);
          },
          error: error => {
            errors++;
            deleteNext(index + 1);
          }
        });
      };

      deleteNext(0);
    });
  }

  // Utility methods
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'unknown';
  }

  isImageFile(filename: string): boolean {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    return imageExtensions.includes(this.getFileExtension(filename));
  }

  isDocumentFile(filename: string): boolean {
    const docExtensions = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];
    return docExtensions.includes(this.getFileExtension(filename));
  }
}
