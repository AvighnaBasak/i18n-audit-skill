import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function TodoApp() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<string[]>([]);

  return (
    <div className="app">
      <header>
        <h1>{t('app.title')}</h1>
        <p>{t('app.subtitle')}</p>
      </header>

      <main>
        <form>
          <input
            type="text"
            placeholder="What needs to be done?"
            aria-label="New task input"
          />
          <button type="submit">{t('todo.add')}</button>
        </form>

        {tasks.length === 0 ? (
          <p>{t('todo.empty')}</p>
        ) : (
          <ul>
            {tasks.map((task, i) => (
              <li key={i}>
                <span>{task}</span>
                <button>{t('todo.complete')}</button>
                <button>{t('todo.delete')}</button>
              </li>
            ))}
          </ul>
        )}

        <p>{t('todo.itemCount', { count: tasks.length })}</p>
      </main>
    </div>
  );
}
