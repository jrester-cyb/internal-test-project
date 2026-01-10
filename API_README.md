# Todo Lists API Documentation

## Setup Complete! 🎉

Your Django REST Framework API with OpenAPI/Swagger UI is now running.

## Access Points

- **Swagger UI**: http://localhost/api/docs/
- **ReDoc**: http://localhost/api/redoc/
- **OpenAPI Schema**: http://localhost/api/schema/
- **Django Admin**: http://localhost/admin/
- **API Root**: http://localhost/api/

## Credentials

- **Username**: admin
- **Password**: (Set via `DJANGO_SUPERUSER_PASSWORD` env variable or reset with `python manage.py changepassword admin`)

## API Endpoints

### TodoLists
- `GET /api/lists/` - List all todo lists
- `POST /api/lists/` - Create a new todo list
- `GET /api/lists/{id}/` - Get a specific todo list with all todos
- `PUT /api/lists/{id}/` - Update a todo list
- `PATCH /api/lists/{id}/` - Partially update a todo list
- `DELETE /api/lists/{id}/` - Delete a todo list

### Todos
- `GET /api/todos/` - List all todos
- `POST /api/todos/` - Create a new todo
- `GET /api/todos/{id}/` - Get a specific todo
- `PUT /api/todos/{id}/` - Update a todo
- `PATCH /api/todos/{id}/` - Partially update a todo
- `DELETE /api/todos/{id}/` - Delete a todo
- `POST /api/todos/{id}/toggle_complete/` - Toggle completion status

## Filtering & Search

### TodoLists
- Search by name or description: `?search=work`
- Order by: `?ordering=name` or `?ordering=-created_at`

### Todos
- Filter by list: `?todo_list=1`
- Filter by completion: `?completed=true` or `?completed=false`
- Filter by priority: `?priority=1` (1=Low, 2=Medium, 3=High)
- Search by title/description: `?search=urgent`
- Order by: `?ordering=priority` or `?ordering=-due_date`

## Example Usage

### Create a TodoList
```bash
curl -X POST http://localhost/api/lists/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Work Tasks",
    "description": "Tasks for the project"
  }'
```

### Create a Todo
```bash
curl -X POST http://localhost/api/todos/ \
  -H "Content-Type: application/json" \
  -d '{
    "todo_list": 1,
    "title": "Complete API documentation",
    "description": "Write comprehensive docs",
    "priority": 3,
    "due_date": "2026-01-15"
  }'
```

### Get All Todos for a List
```bash
curl http://localhost/api/todos/?todo_list=1
```

### Toggle Todo Completion
```bash
curl -X POST http://localhost/api/todos/1/toggle_complete/
```

## Models

### TodoList
- `id` - Auto-generated ID
- `name` - Name of the list (max 200 chars)
- `description` - Optional description
- `created_at` - Timestamp when created
- `updated_at` - Timestamp when last updated
- `todos` - Related todos (nested in retrieve view)
- `todo_count` - Number of todos in the list

### Todo
- `id` - Auto-generated ID
- `todo_list` - Foreign key to TodoList
- `title` - Title of the todo (max 200 chars)
- `description` - Optional description
- `completed` - Boolean completion status
- `priority` - 1 (Low), 2 (Medium), or 3 (High)
- `due_date` - Optional due date
- `created_at` - Timestamp when created
- `updated_at` - Timestamp when last updated

## Interactive Documentation

Visit http://localhost/api/docs/ to explore the API with Swagger UI. You can:
- View all endpoints and their schemas
- Try out requests directly in the browser
- See request/response examples
- Understand data models

## Next Steps

1. Set admin password: `docker compose -f docker-compose.dev.yml exec web python manage.py changepassword admin`
2. Visit http://localhost/api/docs/ to explore the API
3. Create some todo lists and todos
4. Check out the Django admin at http://localhost/admin/
