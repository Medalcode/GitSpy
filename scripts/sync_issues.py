import os
import re
import sys
from github import Github

# Configuration
REPO_NAME = os.getenv("GITHUB_REPOSITORY", "Medalcode/GitSpy")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
INPUT_FILE = "Bitacora.md"

def parse_tasks(content):
    tasks = []
    current_task = None
    
    # Regex for task header: [STATUS] ID — Title
    # Example: [DONE] F-001 — Implementar parser de Bitacora
    header_regex = re.compile(r"^\[(TODO|DONE|IN-PROGRESS)\]\s+(.*)")
    
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
            
        match = header_regex.match(line)
        if match:
            # Save previous task
            if current_task:
                tasks.append(current_task)
            
            status_tag = match.group(1)
            title = match.group(2)
            
            # Map status to label
            label = "status:todo"
            if status_tag == "DONE":
                label = "status:done"
            elif status_tag == "IN-PROGRESS":
                label = "status:in-progress"
                
            current_task = {
                "title": title,
                "body": "",
                "labels": [label],
                "raw_tags": []
            }
        elif current_task:
            # Parse body details
            if line.startswith("Description:"):
                desc = line.replace("Description:", "").strip()
                current_task["body"] += f"{desc}\n\n"
            elif line.startswith("Tags:"):
                # "Tags: parser, core" -> ["parser", "core"]
                tags_content = line.replace("Tags:", "").strip()
                tags = [t.strip() for t in tags_content.split(",")]
                current_task["labels"].extend(tags)
            elif line.startswith("Priority:"):
                # Optional: Add priority label
                priority = line.replace("Priority:", "").strip()
                current_task["labels"].append(f"priority:{priority}")
            elif not line.startswith("Started:") and not line.startswith("Completed:"):
                # Append other lines to body
                current_task["body"] += f"{line}\n"

    # Add last task
    if current_task:
        tasks.append(current_task)
        
    return tasks

def sync_issues():
    if not GITHUB_TOKEN:
        print("Error: GITHUB_TOKEN environment variable not set.")
        sys.exit(1)

    print(f"Connecting to GitHub repo: {REPO_NAME}...")
    g = Github(GITHUB_TOKEN)
    try:
        repo = g.get_repo(REPO_NAME)
    except Exception as e:
        print(f"Error accessing repo: {e}")
        sys.exit(1)

    # Read tasks
    if not os.path.exists(INPUT_FILE):
        print(f"Error: Input file '{INPUT_FILE}' not found.")
        sys.exit(1)
        
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    tasks = parse_tasks(content)
    print(f"Found {len(tasks)} tasks in {INPUT_FILE}.")

    # Get existing issues to avoid duplicates (by title)
    existing_issues = {issue.title: issue for issue in repo.get_issues(state="all")}

    for task in tasks:
        title = task["title"]
        body = task["body"].strip()
        labels = list(set(task["labels"])) # deduplicate

        if title in existing_issues:
            print(f"Skipping existing issue: {title}")
            # Optional: Update issue if needed
            # issue = existing_issues[title]
            # issue.edit(body=body, labels=labels)
        else:
            print(f"Creating issue: {title}")
            try:
                repo.create_issue(title=title, body=body, labels=labels)
            except Exception as e:
                print(f"Failed to create issue '{title}': {e}")

if __name__ == "__main__":
    sync_issues()
