import type { TableField } from '../shared/types';

export function renderFieldList(fields: TableField[], container: HTMLElement): void {
  container.innerHTML = '';

  if (fields.length === 0) {
    container.innerHTML = '<div class="field-list-empty">No fields found</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'field-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Type', 'Field Name', 'Sample Value', 'Col'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  fields.forEach((field, idx) => {
    const tr = document.createElement('tr');
    tr.className = idx % 2 === 0 ? 'field-row-even' : 'field-row-odd';

    const typeCell = document.createElement('td');
    typeCell.className = 'field-type-cell';
    typeCell.textContent = field.type === 'image' ? '🖼️' : '📝';
    tr.appendChild(typeCell);

    const nameCell = document.createElement('td');
    nameCell.className = 'field-name-cell';
    nameCell.textContent = field.name;
    tr.appendChild(nameCell);

    const sampleCell = document.createElement('td');
    sampleCell.className = 'field-sample-cell';
    if (field.type === 'image') {
      const imgCount = field.sample.match(/\d+/);
      sampleCell.textContent = imgCount
        ? imgCount[0] + ' images'
        : 'images';
    } else {
      sampleCell.textContent = field.sample || '(empty)';
    }
    tr.appendChild(sampleCell);

    const idxCell = document.createElement('td');
    idxCell.className = 'field-idx-cell';
    idxCell.textContent = String(field.index);
    tr.appendChild(idxCell);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

export function clearFieldList(): void {
  const container = document.getElementById('field-list-container');
  if (container) {
    container.innerHTML = '';
  }
}

export function updateFieldListState(
  totalRows: number,
  fields: TableField[],
  container: HTMLElement,
): void {
  renderFieldList(fields, container);

  const previewInfo = document.getElementById('preview-info');
  if (previewInfo) {
    previewInfo.textContent = `Total rows: ${totalRows}, Total columns: ${fields.length}`;
  }
}
