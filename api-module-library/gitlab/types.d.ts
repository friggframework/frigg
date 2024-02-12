export type Project = {
    id: number;
    description: null | string;
    name: string;
    name_with_namespace: string;
    path: string;
    path_with_namespace: string;
    created_at: string;
    default_branch: string;
    tag_list: string[];
    topics: string[];
    ssh_url_to_repo: string;
    http_url_to_repo: string;
    web_url: string;
    avatar_url: string;
    star_count: number;
    last_activity_at: string;
    namespace: Namespace;
};

type Namespace = {
    id: number;
    name: string;
    path: string;
    kind: string;
    full_path: string;
    parent_id: null | number;
    avatar_url: null | string;
    web_url: string;
};

export type Issues = {
    project_id: number;
    milestone: Milestone;
    author: User;
    description: string;
    state: string;
    iid: number;
    assignees: User[];
    assignee: User;
    type: string;
    labels: string[];
    upvotes: number;
    downvotes: number;
    merge_requests_count: number;
    id: number;
    title: string;
    updated_at: string;
    created_at: string;
    closed_at: string;
    closed_by: User;
    user_notes_count: number;
    due_date: string;
    web_url: string;
    references: References;
    time_stats: TimeStats;
    has_tasks: boolean;
    task_status: string;
    confidential: boolean;
    discussion_locked: boolean;
    issue_type: string;
    severity: string;
    _links: Links;
    task_completion_status: TaskCompletionStatus;
};

type Milestone = {
    due_date: string;
    project_id: number;
    state: string;
    description: string;
    iid: number;
    id: number;
    title: string;
    created_at: string;
    updated_at: string;
};

type User = {
    state: string;
    web_url: string;
    avatar_url: string | null;
    username: string;
    id: number;
    name: string;
};

type References = {
    short: string;
    relative: string;
    full: string;
};

type TimeStats = {
    time_estimate: number;
    total_time_spent: number;
    human_time_estimate: null | string;
    human_total_time_spent: null | string;
};

type Links = {
    self: string;
    notes: string;
    award_emoji: string;
    project: string;
    closed_as_duplicate_of: string;
};

type TaskCompletionStatus = {
    count: number;
    completed_count: number;
};

export type CreateIssue = {
    /**
     * The ID of the user to assign the issue to. Only appears on GitLab Free.
     */
    assignee_id?: number;
    /**
     * The IDs of the users to assign the issue to. Premium and Ultimate only.
     */
    assignee_ids?: number[];
    /**
     * The title of an issue.
     */
    title: string;
    /**
     * Set an issue to be confidential. Default is false.
     */
    confidential?: boolean;
    /**
     * The description of an issue. Limited to 1,048,576 characters.
     */
    description?: string;
    /**
     * When the issue was created. Date time string, ISO 8601 formatted, for example 2016-03-11T03:45:40Z. Requires administrator or project/group owner rights.
     */
    created_at?: string;
    /**
     * ID of the epic to add the issue to. Valid values are greater than or equal to 0. Premium and Ultimate only.
     */
    epic_id?: number;
    /** IID of the epic to add the issue to. Valid values are greater than or equal to 0. (deprecated, scheduled for removal in API version 5). Premium and Ultimate only. */
    epic_iid?: number;
    /** The internal ID of the project’s issue (requires administrator or project owner rights). */
    iid?: number | string;
    /**
     * The type of issue. One of issue, incident, test_case or task. Default is issue.
     */
    issue_type?: 'issue' | 'incident' | 'test_case' | 'task';
    /**
     * Comma-separated label names for an issue.
     */
    labels?: string[];
    /**
     * The due date. Date time string in the format YYYY-MM-DD, for example 2016-03-11.
     */
    due_date?: string;
    /**
     * The weight of the issue. Valid values are greater than or equal to 0. Premium and Ultimate only.
     */
    weight?: number;
};
