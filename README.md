# Toodles

An advanced todo list.
A todo list should not be a source of shame but a tool to help you manage your time well. 
Let it be a tool that reflects your progress, celebrate what you got done and prevents you from getting your deadlines derailed.
Toodles is immensely flexible to account for changing nature of your todo items. 

## Features
1. Local only database. All data is stored on your browser and can be exported from one device and imported on another.
2. Review mode to encourage periodic review of your todos. Ensures that you don't end up with unending task list
3. Automatic suggestions to reduce decision making for you
4. Add tags to organize todos. Nesting is allowed eg (#type/work vs #type/personal)

## Data Layer
### Todo
The smallest unit of work is called a todo. It has the following fields : 
- title
- timeblock : specific time and date when you intend to complete this task
- estimate (duration like hours, minutes or days)
- deadline (optional)
- parent (optional)

User is encouraged to create a todo quickly so only the title is a mandatory field. Everything else can be optional to allow for quick entry and later edits.

A todo can have a parent, which is another todo. This is to enable users to split a todo into smaller chunks as they have more clarity on the task or new complications arise. The system should be flexible enough to handle this. Changing the parent of a todo or deleting it should be easy to allow for flexible evolution of a task.


# Upcoming Features
- Allow configuring grouping of todos by tags
- Add support for habit tracking