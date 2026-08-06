# Raw HTML

<table border="1" onclick="alert(1)">
  <thead>
    <tr>
      <th rowspan="2">NO</th>
      <th colspan="2">Common</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><span style="background-color: #FFFF00; color: #111111; padding: 2px 8px; position: fixed;" onmouseover="alert(1)">Ready</span></td>
      <td>Value A</td>
      <td>Value B</td>
    </tr>
  </tbody>
  <script>alert('blocked')</script>
</table>

Inline <span style="color: #FF0000;">red text</span> remains in the paragraph.

Nested inline <font color="red">~~removed text~~</font> keeps both formats.

<div class="markdown-shell" onclick="alert(1)">

| Name | Result |
|---|---|
| alpha | **ok** |

</div>
