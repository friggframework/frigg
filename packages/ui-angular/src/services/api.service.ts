/**
 * Angular API Service
 * Wraps ui-core ApiClient with Angular HttpClient and RxJS observables
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, from } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import ApiClient from '@friggframework/ui-core/api';

export interface ApiConfig {
  baseUrl: string;
  jwt?: string;
}

export interface LoginResponse {
  token: string;
  user?: any;
}

export interface Integration {
  id: string;
  entities: any[];
  config: any;
  status: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiClient: ApiClient;
  private configSubject: BehaviorSubject<ApiConfig>;
  private authTokenSubject: BehaviorSubject<string | null>;

  public config$: Observable<ApiConfig>;
  public authToken$: Observable<string | null>;
  public isAuthenticated$: Observable<boolean>;

  constructor(private http: HttpClient) {
    // Initialize with empty config
    const initialConfig: ApiConfig = {
      baseUrl: '',
      jwt: undefined
    };

    this.configSubject = new BehaviorSubject<ApiConfig>(initialConfig);
    this.authTokenSubject = new BehaviorSubject<string | null>(null);

    this.config$ = this.configSubject.asObservable();
    this.authToken$ = this.authTokenSubject.asObservable();
    this.isAuthenticated$ = this.authToken$.pipe(
      map(token => !!token)
    );

    // Create initial API client
    this.apiClient = new ApiClient(initialConfig.baseUrl, initialConfig.jwt);
  }

  /**
   * Initialize the API service with configuration
   */
  initialize(config: ApiConfig): void {
    this.apiClient = new ApiClient(config.baseUrl, config.jwt);
    this.configSubject.next(config);
    if (config.jwt) {
      this.authTokenSubject.next(config.jwt);
    }
  }

  /**
   * Update the base URL
   */
  setBaseUrl(baseUrl: string): void {
    const currentConfig = this.configSubject.value;
    const newConfig = { ...currentConfig, baseUrl };
    this.apiClient = new ApiClient(baseUrl, currentConfig.jwt);
    this.configSubject.next(newConfig);
  }

  /**
   * Update the JWT token
   */
  setAuthToken(jwt: string | null): void {
    const currentConfig = this.configSubject.value;
    const newConfig = { ...currentConfig, jwt: jwt || undefined };
    this.apiClient = new ApiClient(currentConfig.baseUrl, jwt || undefined);
    this.configSubject.next(newConfig);
    this.authTokenSubject.next(jwt);
  }

  /**
   * Get current headers with auth token
   */
  private getHeaders(): HttpHeaders {
    const headers: any = {
      'Content-Type': 'application/json'
    };

    const token = this.authTokenSubject.value;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return new HttpHeaders(headers);
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
      
      if (error.status === 401) {
        // Unauthorized - clear token
        this.setAuthToken(null);
      }
    }

    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Login user
   */
  login(username: string, password: string): Observable<LoginResponse> {
    return from(this.apiClient.login(username, password)).pipe(
      tap((response: any) => {
        if (response.token) {
          this.setAuthToken(response.token);
        }
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Create new user
   */
  createUser(username: string, password: string): Observable<any> {
    return from(this.apiClient.createUser(username, password)).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Logout user
   */
  logout(): void {
    this.setAuthToken(null);
  }

  /**
   * List all integrations
   */
  listIntegrations(): Observable<Integration[]> {
    return from(this.apiClient.listIntegrations()).pipe(
      map(response => response || []),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get authorize requirements
   */
  getAuthorizeRequirements(entityType: string, connectingEntityType: string): Observable<any> {
    return from(
      this.apiClient.getAuthorizeRequirements(entityType, connectingEntityType)
    ).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Authorize entity
   */
  authorize(entityType: string, authData: any): Observable<any> {
    return from(this.apiClient.authorize(entityType, authData)).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Create integration
   */
  createIntegration(entity1: any, entity2: any, config: any): Observable<Integration> {
    return from(this.apiClient.createIntegration(entity1, entity2, config)).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Update integration
   */
  updateIntegration(integrationId: string, config: any): Observable<Integration> {
    return from(this.apiClient.updateIntegration(integrationId, config)).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Delete integration
   */
  deleteIntegration(integrationId: string): Observable<void> {
    return from(this.apiClient.deleteIntegration(integrationId)).pipe(
      map(() => void 0),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get integration config options
   */
  getIntegrationConfigOptions(integrationId: string): Observable<any> {
    return from(this.apiClient.getIntegrationConfigOptions(integrationId)).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get sample data
   */
  getSampleData(integrationId: string): Observable<any> {
    return from(this.apiClient.getSampleData(integrationId)).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get user actions
   */
  getUserActions(integrationId: string, actionType: string): Observable<any> {
    return from(this.apiClient.getUserActions(integrationId, actionType)).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get user action options
   */
  getUserActionOptions(integrationId: string, selectedUserAction: string, data: any): Observable<any> {
    return from(
      this.apiClient.getUserActionOptions(integrationId, selectedUserAction, data)
    ).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Submit user action
   */
  submitUserAction(integrationId: string, selectedUserAction: string, data: any): Observable<any> {
    return from(
      this.apiClient.submitUserAction(integrationId, selectedUserAction, data)
    ).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Generic GET request
   */
  get<T>(endpoint: string): Observable<T> {
    const url = `${this.configSubject.value.baseUrl}${endpoint}`;
    return this.http.get<T>(url, { headers: this.getHeaders() }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Generic POST request
   */
  post<T>(endpoint: string, data: any): Observable<T> {
    const url = `${this.configSubject.value.baseUrl}${endpoint}`;
    return this.http.post<T>(url, data, { headers: this.getHeaders() }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Generic PUT request
   */
  put<T>(endpoint: string, data: any): Observable<T> {
    const url = `${this.configSubject.value.baseUrl}${endpoint}`;
    return this.http.put<T>(url, data, { headers: this.getHeaders() }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Generic PATCH request
   */
  patch<T>(endpoint: string, data: any): Observable<T> {
    const url = `${this.configSubject.value.baseUrl}${endpoint}`;
    return this.http.patch<T>(url, data, { headers: this.getHeaders() }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Generic DELETE request
   */
  delete<T>(endpoint: string): Observable<T> {
    const url = `${this.configSubject.value.baseUrl}${endpoint}`;
    return this.http.delete<T>(url, { headers: this.getHeaders() }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Refresh options
   */
  refreshOptions(params: { endpoint: string; data: any }): Observable<any> {
    return from(this.apiClient.refreshOptions(params)).pipe(
      catchError(this.handleError.bind(this))
    );
  }
}